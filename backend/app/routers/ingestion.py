from fastapi import APIRouter, HTTPException
from typing import List
from ..schemas import IngestionCreate, IngestionOut, StepOut, PackageOut

router = APIRouter()

@router.post("/", response_model=IngestionOut)
def create_ingestion(payload: IngestionCreate):
    """Create an ingestion row and enqueue processing. Supabase SDK call placeholder."""
    # TODO: insert into public.ingestions via Supabase Python client
    # TODO: enqueue background job (Cloud Run task / worker) to process steps
    return IngestionOut(id="stub", status="queued", progress=0)

@router.get("/{ingestion_id}", response_model=IngestionOut)
def get_ingestion(ingestion_id: str):
    # TODO: fetch from Supabase
    return IngestionOut(id=ingestion_id, status="running", progress=25)

@router.get("/{ingestion_id}/steps", response_model=List[StepOut])
def list_steps(ingestion_id: str):
    # TODO: fetch related steps
    return []

@router.get("/{ingestion_id}/package", response_model=PackageOut)
def get_package(ingestion_id: str):
    # TODO: fetch final package row
    return PackageOut(id="stub", document_url=None, deck_url=None, summary={})

