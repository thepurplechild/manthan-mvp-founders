"""Vercel entrypoint to enqueue packaging agent jobs."""
from __future__ import annotations

import logging
import os
import sys
from http import HTTPStatus
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, request
from pydantic import ValidationError

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from lib.packaging_agent import pipeline, supabase_client  # noqa: E402
from lib.packaging_agent.schemas import RunRequest

app = Flask(__name__)


def _configure_logging() -> None:
    if logging.getLogger().handlers:
        return
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(level=level)


_configure_logging()
logger = logging.getLogger(__name__)


def _json_error(message: str, status: HTTPStatus) -> Any:
    return jsonify({"error": message}), status


@app.route("/", methods=["POST"])
def enqueue() -> Any:
    """Enqueue a packaging job or process synchronously for testing."""

    if not request.data:
        return _json_error("Request body required", HTTPStatus.BAD_REQUEST)

    try:
        payload = request.get_json(force=True)
    except Exception:  # noqa: BLE001
        return _json_error("Invalid JSON body", HTTPStatus.BAD_REQUEST)

    try:
        run_request = RunRequest.model_validate(payload)
    except ValidationError as exc:
        return _json_error(exc.errors(), HTTPStatus.BAD_REQUEST)

    logger.info("Enqueuing packaging job for project %s", run_request.project_id)
    try:
        job_id = supabase_client.insert_job(run_request.project_id, run_request.mandates)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to insert job: %s", exc)
        return _json_error("Unable to enqueue job", HTTPStatus.INTERNAL_SERVER_ERROR)

    if run_request.mode == "sync":
        logger.info("Processing job %s synchronously", job_id)
        try:
            supabase_client.update_job_status(job_id, "processing")
            result = pipeline.run_pipeline(run_request.project_id, run_request.mandates)
            docx_bytes: bytes = result["docx_bytes"]
            storage_path = supabase_client.upload_docx(run_request.project_id, docx_bytes)
            supabase_client.upsert_generated_asset(
                run_request.project_id,
                storage_path,
                status="completed",
                error=None,
            )
            supabase_client.update_job_status(job_id, "completed", asset_path=storage_path)
            return jsonify(
                {
                    "status": "completed",
                    "jobId": job_id,
                    "generatedAssetPath": storage_path,
                }
            ), HTTPStatus.OK
        except Exception as exc:  # noqa: BLE001
            logger.exception("Synchronous processing failed: %s", exc)
            supabase_client.update_job_status(job_id, "failed", error=str(exc))
            return _json_error("Synchronous processing failed", HTTPStatus.INTERNAL_SERVER_ERROR)

    response: Dict[str, Any] = {"jobId": job_id, "status": "queued"}
    return jsonify(response), HTTPStatus.ACCEPTED


@app.route("/", methods=["OPTIONS"])
def options() -> Any:
    return ("", HTTPStatus.NO_CONTENT)


if __name__ == "__main__":  # pragma: no cover
    app.run(debug=True)
