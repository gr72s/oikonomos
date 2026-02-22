from fastapi import APIRouter, Query

from app.models import ReportDto
from app.services.finance import get_cash_flow_report, get_utility_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/cash", response_model=ReportDto)
def get_cash(periodYm: str = Query(...)) -> ReportDto:
    return get_cash_flow_report(periodYm)


@router.get("/utility", response_model=ReportDto)
def get_utility(periodYm: str = Query(...)) -> ReportDto:
    return get_utility_report(periodYm)
