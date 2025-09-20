"""Supabase client helpers for packaging agent storage and database access."""
from __future__ import annotations

import io
import logging
import os
import uuid
from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List, Optional

import requests
from supabase import Client, create_client

from .schemas import (
    DEFAULT_ASSET_TYPE,
    DEFAULT_JOB_CLAIM_LIMIT,
    GENERATED_ASSETS_TABLE,
    GENERATED_BUCKET_ENV,
    JOB_CLAIM_LIMIT_ENV,
    PACKAGING_JOBS_TABLE,
    SOURCE_BUCKET_ENV,
    GeneratedAssetRow,
    JobRow,
)

logger = logging.getLogger(__name__)

_TABLES_INITIALIZED = False
_UNSET = object()


def _storage_client(client: Client):
    """Return the storage client for current Supabase SDK version."""

    storage = getattr(client, "storage")
    return storage() if callable(storage) else storage


class SupabaseConfigError(RuntimeError):
    """Raised when required Supabase configuration is missing."""


def _get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SupabaseConfigError(f"Missing required environment variable: {name}")
    return value


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Instantiate and memoize the Supabase client."""

    url = _get_env("SUPABASE_URL")
    key = _get_env("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(url, key)
    return client


def _pg_execute(sql: str) -> None:
    """Execute a SQL statement via Supabase's pg_execute RPC."""

    url = _get_env("SUPABASE_URL")
    key = _get_env("SUPABASE_SERVICE_ROLE_KEY")
    endpoint = f"{url}/rest/v1/rpc/pg_execute"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {"query": sql}
    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=15)
    except requests.RequestException as exc:  # pragma: no cover - network failure
        raise RuntimeError(f"pg_execute network error: {exc}") from exc
    if response.status_code >= 400:
        raise RuntimeError(f"pg_execute failed ({response.status_code}): {response.text}")


def ensure_tables() -> None:
    """Ensure packaging_jobs and generated_assets tables exist."""

    global _TABLES_INITIALIZED
    if _TABLES_INITIALIZED:
        return

    sql = """
    create extension if not exists "uuid-ossp";

    create table if not exists public.packaging_jobs (
        id uuid primary key default gen_random_uuid(),
        project_id text not null,
        mandates jsonb,
        status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
        error text,
        asset_path text,
        claimed_at timestamptz,
        completed_at timestamptz,
        worker_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
    );

    create table if not exists public.generated_assets (
        id uuid primary key default gen_random_uuid(),
        project_id text not null,
        asset_type text not null default 'docx',
        storage_path text not null,
        status text not null check (status in ('processing','completed','failed')),
        error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
    );

    create or replace function public.fn_claim_packaging_jobs(p_limit integer, p_worker_id text)
    returns setof public.packaging_jobs
    language plpgsql
    as $$
    declare
      v_limit integer := greatest(p_limit, 1);
    begin
      return query
      with job_ids as (
        select id from public.packaging_jobs
        where status = 'queued'
        order by created_at asc
        for update skip locked
        limit v_limit
      )
      update public.packaging_jobs pj
      set status = 'processing',
          claimed_at = now(),
          updated_at = now(),
          worker_id = coalesce(p_worker_id, 'worker-' || left(uuid_generate_v4()::text, 8))
      from job_ids
      where pj.id = job_ids.id
      returning pj.*;
    end;
    $$;

    create or replace function public.fn_touch_generated_asset()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;

    create or replace function public.fn_touch_packaging_job()
    returns trigger
    language plpgsql
    as $$
    begin
      new.updated_at = now();
      return new;
    end;
    $$;

    drop trigger if exists trg_generated_assets_touch on public.generated_assets;
    create trigger trg_generated_assets_touch
      before update on public.generated_assets
      for each row execute function public.fn_touch_generated_asset();

    drop trigger if exists trg_packaging_jobs_touch on public.packaging_jobs;
    create trigger trg_packaging_jobs_touch
      before update on public.packaging_jobs
      for each row execute function public.fn_touch_packaging_job();
    """

    _pg_execute(sql)
    _TABLES_INITIALIZED = True


def download_script(project_id: str) -> str:
    """Download the project script from Supabase Storage as UTF-8 text."""

    ensure_tables()
    bucket = _get_env(SOURCE_BUCKET_ENV)
    client = get_supabase()
    storage = _storage_client(client)
    base_path = f"projects/{project_id}/source"
    candidate_files = [
        "script.txt",
        "script.md",
        "script.docx",
    ]
    for filename in candidate_files:
        path = f"{base_path}/{filename}"
        try:
            logger.debug("Attempting to download %s from bucket %s", path, bucket)
            content = storage.from_(bucket).download(path)
            if filename.endswith(".docx"):
                from docx import Document  # type: ignore

                document = Document(io.BytesIO(content))
                paragraphs = [para.text for para in document.paragraphs]
                text = "\n".join(p for p in paragraphs if p)
                if text.strip():
                    return text
                continue
            return content.decode("utf-8").strip()
        except Exception as exc:  # noqa: BLE001
            logger.debug("Failed to download %s: %s", path, exc)
            continue
    raise FileNotFoundError(f"No script found for project {project_id} in bucket {bucket}")


def upload_docx(project_id: str, docx_bytes: bytes) -> str:
    """Upload the generated docx to Supabase Storage and return the storage path."""

    ensure_tables()
    bucket = _get_env(GENERATED_BUCKET_ENV)
    client = get_supabase()
    storage = _storage_client(client)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    path = f"projects/{project_id}/generated/packaging-{timestamp}.docx"
    storage.from_(bucket).upload(
        path,
        docx_bytes,
        file_options={
            "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "cache-control": "max-age=31536000",
            "upsert": True,
        },
    )
    return path


def insert_job(project_id: str, mandates: Optional[Dict[str, Any]]) -> str:
    """Insert a new job row and return its id."""

    ensure_tables()
    client = get_supabase()
    record = {
        "project_id": project_id,
        "mandates": mandates,
        "status": "queued",
    }
    response = client.table(PACKAGING_JOBS_TABLE).insert(record).execute()
    data = getattr(response, "data", None)
    if not data:
        raise RuntimeError("Failed to insert packaging job")
    job = JobRow.model_validate(data[0])
    return job.id


def claim_jobs(limit: Optional[int] = None, worker_id: Optional[str] = None) -> List[JobRow]:
    """Claim queued jobs atomically using the database function."""

    ensure_tables()
    client = get_supabase()
    effective_limit = limit or int(os.getenv(JOB_CLAIM_LIMIT_ENV, DEFAULT_JOB_CLAIM_LIMIT))
    payload = {
        "p_limit": effective_limit,
        "p_worker_id": worker_id or f"worker-{uuid.uuid4().hex[:8]}",
    }
    response = client.rpc("fn_claim_packaging_jobs", payload).execute()
    data = getattr(response, "data", None) or []
    claimed: List[JobRow] = [JobRow.model_validate(row) for row in data]
    return claimed


def update_job_status(
    job_id: str,
    status: str,
    *,
    error: Any = _UNSET,
    asset_path: Any = _UNSET,
) -> None:
    """Update job status, error, and asset path as needed."""

    ensure_tables()
    client = get_supabase()
    update: Dict[str, Any] = {"status": status}
    if error is not _UNSET:
        update["error"] = error
    if asset_path is not _UNSET:
        update["asset_path"] = asset_path
    if status in {"completed", "failed"}:
        update["completed_at"] = datetime.utcnow().isoformat()
    response = client.table(PACKAGING_JOBS_TABLE).update(update).eq("id", job_id).execute()
    if getattr(response, "status_code", 200) >= 400:
        raise RuntimeError(f"Failed to update job {job_id}: {response}")


def upsert_generated_asset(
    project_id: str,
    storage_path: str,
    status: str,
    *,
    error: Optional[str] = None,
) -> GeneratedAssetRow:
    """Upsert a generated asset row and return it."""

    ensure_tables()
    client = get_supabase()
    payload = {
        "project_id": project_id,
        "asset_type": DEFAULT_ASSET_TYPE,
        "storage_path": storage_path,
        "status": status,
        "error": error,
        "updated_at": datetime.utcnow().isoformat(),
    }
    response = client.table(GENERATED_ASSETS_TABLE).upsert(payload, on_conflict="project_id,asset_type").execute()
    data = getattr(response, "data", None)
    if not data:
        raise RuntimeError("Failed to upsert generated asset")
    return GeneratedAssetRow.model_validate(data[0])
