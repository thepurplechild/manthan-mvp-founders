"""Pydantic schemas and constants for the packaging agent."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

PACKAGING_JOBS_TABLE = "packaging_jobs"
GENERATED_ASSETS_TABLE = "generated_assets"
DEFAULT_ASSET_TYPE = "docx"
SOURCE_BUCKET_ENV = "SOURCE_BUCKET"
GENERATED_BUCKET_ENV = "GENERATED_BUCKET"
JOB_CLAIM_LIMIT_ENV = "JOB_CLAIM_LIMIT"
DEFAULT_JOB_CLAIM_LIMIT = 2


class RunRequest(BaseModel):
    """Incoming request payload for enqueuing the packaging agent."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    project_id: str = Field(..., alias="projectId")
    mandates: Optional[Dict[str, Any]] = None
    mode: Optional[Literal["sync", "async"]] = Field(default="async")

    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("projectId must be a non-empty string")
        if len(value) > 255:
            raise ValueError("projectId is too long")
        return value.strip()


class JobRow(BaseModel):
    """Row model for the packaging_jobs table."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    mandates: Optional[Dict[str, Any]] = None
    status: Literal["queued", "processing", "completed", "failed"]
    error: Optional[str] = None
    asset_path: Optional[str] = None
    claimed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    worker_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class GeneratedAssetRow(BaseModel):
    """Row model for the generated_assets table."""

    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = None
    project_id: str
    asset_type: str = DEFAULT_ASSET_TYPE
    storage_path: str
    status: Literal["processing", "completed", "failed"]
    error: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AnthropicMessage(BaseModel):
    """Minimal representation of an Anthropic message."""

    role: Literal["user", "assistant", "system"]
    content: str


class AnthropicResponse(BaseModel):
    """Subset of the Anthropic response payload we care about."""

    id: str
    content: list[Dict[str, Any]]
    model: str
    stop_reason: Optional[str] = None
    stop_sequence: Optional[str] = None
    usage: Optional[Dict[str, Any]] = None
