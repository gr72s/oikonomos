from fastapi import APIRouter

from app.models import ReconcileInput, ReconcileResultDto
from app.services.finance import reconcile_account

router = APIRouter(prefix="/reconciliations", tags=["reconciliations"])


@router.post("", response_model=ReconcileResultDto)
def post_reconciliation(input_data: ReconcileInput) -> ReconcileResultDto:
    return reconcile_account(input_data)
