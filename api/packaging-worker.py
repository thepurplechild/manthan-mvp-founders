"""Worker endpoint to process queued packaging jobs."""
from __future__ import annotations

import logging
import os
import sys
import uuid
from http import HTTPStatus
from pathlib import Path
from typing import Any, Dict, List

from flask import Flask, jsonify, request

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from lib.packaging_agent import pipeline, supabase_client  # noqa: E402

app = Flask(__name__)


def _configure_logging() -> None:
    if logging.getLogger().handlers:
        return
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    logging.basicConfig(level=level)


_configure_logging()
logger = logging.getLogger(__name__)


@app.route("/", methods=["GET"])
def run_worker() -> Any:
    """Claim and process queued packaging jobs."""

    limit_param = request.args.get("limit")
    try:
        limit = int(limit_param) if limit_param else None
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), HTTPStatus.BAD_REQUEST

    worker_id = os.getenv("WORKER_ID") or f"worker-{uuid.uuid4().hex[:8]}"
    claimed = supabase_client.claim_jobs(limit=limit, worker_id=worker_id)
    logger.info("Worker %s claimed %d jobs", worker_id, len(claimed))

    processed: List[Dict[str, Any]] = []

    for job in claimed:
        logger.info("Processing job %s for project %s", job.id, job.project_id)
        try:
            result = pipeline.run_pipeline(job.project_id, job.mandates)
            docx_bytes: bytes = result["docx_bytes"]
            storage_path = supabase_client.upload_docx(job.project_id, docx_bytes)
            supabase_client.upsert_generated_asset(
                job.project_id,
                storage_path,
                status="completed",
                error=None,
            )
            supabase_client.update_job_status(job.id, "completed", asset_path=storage_path)
            processed.append(
                {
                    "jobId": job.id,
                    "status": "completed",
                    "assetPath": storage_path,
                }
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Job %s failed: %s", job.id, exc)
            supabase_client.update_job_status(job.id, "failed", error=str(exc))
            processed.append(
                {
                    "jobId": job.id,
                    "status": "failed",
                    "error": str(exc),
                }
            )

    response = {
        "workerId": worker_id,
        "claimed": [job.id for job in claimed],
        "processed": processed,
    }
    return jsonify(response), HTTPStatus.OK


@app.route("/", methods=["OPTIONS"])
def options() -> Any:
    return ("", HTTPStatus.NO_CONTENT)


if __name__ == "__main__":  # pragma: no cover
    app.run(debug=True)
