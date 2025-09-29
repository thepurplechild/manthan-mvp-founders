import json
import os
import re
import traceback
from typing import Any, Dict, Optional, TypedDict, List

import requests
from flask import Flask, Request, Response, jsonify, request
from supabase import create_client, Client as SupabaseClient
import anthropic

# ------------ Config & Types ------------

QUEUE_KEY = "ai-packaging-queue"
DLQ_KEY = "ai-packaging-dead-letter"
BUCKET_NAME = "script-uploads"

UUID_V4_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)

class PackagingJob(TypedDict):
    projectId: str
    filePath: str
    userId: str
    enqueuedAt: str  # ISO 8601

class ExtractionResult(TypedDict):
    logline: str
    synopsis: str
    themes: List[str]
    characters: List[Dict[str, str]]

# ------------ Helpers: Env & Clients ------------

def require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val

def get_kv_base() -> str:
    return require_env("KV_REST_API_URL").rstrip("/")

def get_kv_token() -> str:
    return require_env("KV_REST_API_TOKEN")

def kv_headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {get_kv_token()}"}

def kv_lpop(key: str) -> Optional[str]:
    """
    Upstash/Vercel KV REST: LPOP via GET to /lpop/{key}
    Returns the popped string or None.
    """
    url = f"{get_kv_base()}/lpop/{key}"
    resp = requests.get(url, headers=kv_headers(), timeout=15)
    if resp.status_code != 200:
        raise RuntimeError(f"KV LPOP failed [{resp.status_code}]: {resp.text}")
    data = resp.json()
    # Upstash returns {"result": "..."} or {"result": null}
    return data.get("result")

def kv_rpush(key: str, value: str) -> None:
    """
    RPUSH via GET to /rpush/{key}/{value} (URL-escaped).
    """
    from urllib.parse import quote
    url = f"{get_kv_base()}/rpush/{key}/{quote(value, safe='')}"
    resp = requests.get(url, headers=kv_headers(), timeout=15)
    if resp.status_code != 200:
        raise RuntimeError(f"KV RPUSH failed [{resp.status_code}]: {resp.text}")

def create_supabase_admin() -> SupabaseClient:
    url = require_env("SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)

def create_anthropic_client() -> anthropic.Anthropic:
    api_key = require_env("ANTHROPIC_API_KEY")
    return anthropic.Anthropic(api_key=api_key)

def auth_ok(req: Request) -> bool:
    hdr = req.headers.get("Authorization", "")
    if not hdr.startswith("Bearer "):
        return False
    token = hdr.split(" ", 1)[1].strip()
    return token and token == require_env("CRON_SECRET")

# ------------ Processing Logic ------------

def preprocess_text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="ignore")
    # Simple normalization: collapse excessive whitespace
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def build_anthropic_prompt(script_text: str) -> str:
    return (
        "You are an expert story analyst. Read the screenplay text below and return a STRICT JSON object "
        "with the following keys only: logline (string), synopsis (string, <=150 words), "
        "themes (array of strings), characters (array of objects with keys: name, description).\n\n"
        "If content is insufficient, infer cautiously and keep concise.\n\n"
        "Return ONLY JSON (no prose). If you cannot comply, still return a minimal valid JSON with empty fields.\n\n"
        "=== SCREENPLAY START ===\n"
        f"{script_text[:120000]}\n"  # hard cap for token safety
        "=== SCREENPLAY END ==="
    )

def call_anthropic_extract(client: anthropic.Anthropic, script_text: str) -> ExtractionResult:
    msg = client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=1200,
        temperature=0,
        messages=[
            {"role": "user", "content": build_anthropic_prompt(script_text)}
        ]
    )
    # Extract text content (Anthropic messages API returns content blocks)
    content_text = ""
    for block in getattr(msg, "content", []) or []:
        # block.type could be 'text', 'tool_use', etc. We only care text
        if hasattr(block, "text"):
            content_text += block.text
        elif isinstance(block, dict) and "text" in block:
            content_text += block["text"]

    # Attempt to parse JSON
    try:
        parsed = json.loads(content_text)
    except Exception:
        # Fallback: try to extract JSON substring
        match = re.search(r"\{.*\}", content_text, re.S)
        if not match:
            raise RuntimeError("Anthropic response did not contain valid JSON.")
        parsed = json.loads(match.group(0))

    # Validate shape & coerce
    def ensure_list_str(val: Any) -> List[str]:
        if isinstance(val, list):
            return [str(x) for x in val]
        return []

    def ensure_characters(val: Any) -> List[Dict[str, str]]:
        out: List[Dict[str, str]] = []
        if isinstance(val, list):
            for itm in val:
                if isinstance(itm, dict):
                    name = str(itm.get("name", "")).strip()
                    desc = str(itm.get("description", "")).strip()
                    if name or desc:
                        out.append({"name": name, "description": desc})
        return out

    result: ExtractionResult = {
        "logline": str(parsed.get("logline", "")).strip(),
        "synopsis": str(parsed.get("synopsis", "")).strip(),
        "themes": ensure_list_str(parsed.get("themes")),
        "characters": ensure_characters(parsed.get("characters")),
    }
    return result

def update_project_with_extraction(sb: SupabaseClient, project_id: str, data: ExtractionResult) -> None:
    # Upsert the extracted fields onto the project row
    # Assumes columns: logline (text), synopsis (text), themes (jsonb), characters (jsonb), status (text)
    upd = {
        "logline": data["logline"],
        "synopsis": data["synopsis"],
        "themes": data["themes"],
        "characters": data["characters"],
        "status": "in_review",
    }
    resp = sb.table("projects").update(upd).eq("id", project_id).execute()
    if getattr(resp, "error", None):
        raise RuntimeError(f"Failed to update project: {getattr(resp.error, 'message', resp)}")

def download_script_bytes(sb: SupabaseClient, file_path: str) -> bytes:
    # Direct download from storage bucket
    data = sb.storage.from_(BUCKET_NAME).download(file_path)
    if not data:
        raise RuntimeError(f"Failed to download script from storage: {file_path}")
    return data

def process_single_job(job_json: str) -> Dict[str, Any]:
    job: PackagingJob = json.loads(job_json)
    project_id = job.get("projectId", "")
    file_path = job.get("filePath", "")

    if not project_id or not UUID_V4_RE.match(project_id):
        raise ValueError("Invalid or missing projectId in job.")
    if not file_path or ".." in file_path:
        raise ValueError("Invalid or missing filePath in job.")

    sb = create_supabase_admin()
    raw_bytes = download_script_bytes(sb, file_path)
    script_text = preprocess_text(raw_bytes)

    anth = create_anthropic_client()
    extraction = call_anthropic_extract(anth, script_text)
    update_project_with_extraction(sb, project_id, extraction)

    return {
        "ok": True,
        "processed": True,
        "projectId": project_id,
        "filePath": file_path,
    }

# ------------ Flask App ------------

app = Flask(__name__)

@app.get("/")
def root() -> Response:
    return jsonify({"ok": True, "service": "ai-packaging-worker"}), 200

@app.get("/api/cron/process-queue")
def process_queue() -> Response:
    # Security: Bearer token must match CRON_SECRET
    try:
        if not auth_ok(request):
            return jsonify({"error": "Unauthorized"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    try:
        # Try to pop a job
        popped = kv_lpop(QUEUE_KEY)
        if popped is None:
            return jsonify({"ok": True, "processed": False, "reason": "empty"}), 200

        # Process one job
        result = process_single_job(popped)
        return jsonify(result), 200

    except Exception as e:
        # Log and dead-letter the job if we still have the serialized content in scope
        err_text = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        try:
            # Push the failed job payload and error to DLQ (as JSON with error info)
            dlq_payload = json.dumps({"job": popped if 'popped' in locals() else None, "error": err_text})
            kv_rpush(DLQ_KEY, dlq_payload)
        except Exception:
            # Swallow DLQ errors to avoid cascading failures
            pass
        return jsonify({"ok": False, "processed": False, "error": str(e)}), 500

# Vercel requires the module-level "app" to be detected.
