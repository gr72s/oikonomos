from fastapi import APIRouter

from app.models import AccountDto, CreateAccountInput
from app.services.finance import create_account, list_accounts

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountDto])
def get_accounts() -> list[AccountDto]:
    return list_accounts()


@router.post("", response_model=AccountDto)
def post_account(input_data: CreateAccountInput) -> AccountDto:
    return create_account(input_data)
