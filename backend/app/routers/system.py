from fastapi import APIRouter

from app.models import InitStateDto
from app.services.finance import init_state

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/init", response_model=InitStateDto)
def get_init_state() -> InitStateDto:
    return InitStateDto(**init_state())
