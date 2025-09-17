from fastapi import APIRouter
from ..schemas import RecommendIn, RecommendOut

router = APIRouter()

@router.post("/content", response_model=RecommendOut)
def recommend_content(payload: RecommendIn):
    """Return basic suggestions using trends (later: SQL/RPC call)."""
    # TODO: query Supabase view public.v_region_genre_hints and indian_market_trends
    suggestions = {
        "region": payload.region,
        "genres": ["Bollywood Drama", "Thriller/Crime"],
        "platforms": ["Disney+ Hotstar", "Prime Video India"],
        "notes": ["Festive season favors family dramas"],
    }
    return RecommendOut(suggestions=suggestions)

