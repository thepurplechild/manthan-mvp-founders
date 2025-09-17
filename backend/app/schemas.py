from typing import Optional, List, Literal, Dict, Any
from pydantic import BaseModel, HttpUrl

class IngestionCreate(BaseModel):
    project_id: Optional[str]
    source_file_url: HttpUrl
    mime_type: Optional[str]

class IngestionOut(BaseModel):
    id: str
    status: Literal['queued','running','paused','failed','succeeded']
    progress: int

class StepOut(BaseModel):
    id: str
    name: Literal['script_preprocess','core_extraction','character_bible','market_adaptation','package_assembly','final_package']
    status: Literal['queued','running','failed','succeeded','skipped']
    output: Dict[str, Any] = {}

class PackageOut(BaseModel):
    id: str
    document_url: Optional[str]
    deck_url: Optional[str]
    summary: Dict[str, Any] = {}

class RecommendIn(BaseModel):
    region: Optional[str]
    language: Optional[str]
    genre: Optional[str]

class RecommendOut(BaseModel):
    suggestions: Dict[str, Any]

