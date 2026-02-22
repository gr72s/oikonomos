from fastapi import APIRouter, Query

from app.models import AdjustmentKpiDto, KpiPeriodInput
from app.services.finance import list_adjustment_kpi

router = APIRouter(prefix="/kpis", tags=["kpis"])


@router.get("/adjustment", response_model=AdjustmentKpiDto)
def get_adjustment_kpi(
    fromPeriodYm: str | None = Query(default=None),
    toPeriodYm: str | None = Query(default=None),
) -> AdjustmentKpiDto:
    payload = None
    if fromPeriodYm is not None or toPeriodYm is not None:
        payload = KpiPeriodInput(fromPeriodYm=fromPeriodYm, toPeriodYm=toPeriodYm)
    return list_adjustment_kpi(payload)
