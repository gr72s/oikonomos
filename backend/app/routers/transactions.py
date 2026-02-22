from fastapi import APIRouter, Query

from app.models import AccrualType, CreateTransactionInput, PagedTransactionsDto, TransactionDto
from app.services.finance import create_transaction, list_transactions

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=PagedTransactionsDto)
def get_transactions(
    periodYm: str | None = Query(default=None),
    accrualType: AccrualType | None = Query(default=None),
) -> PagedTransactionsDto:
    return list_transactions(periodYm, accrualType)


@router.post("", response_model=TransactionDto)
def post_transaction(input_data: CreateTransactionInput) -> TransactionDto:
    return create_transaction(input_data)
