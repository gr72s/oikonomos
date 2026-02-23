from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class AccountType(str, Enum):
    ASSET = "Asset"
    LIABILITY = "Liability"


class AssetPurpose(str, Enum):
    INVESTMENT = "Investment"
    PRODUCTIVITY = "Productivity"
    LIFE_SUPPORT = "LifeSupport"
    SPIRITUAL = "Spiritual"


class AccrualType(str, Enum):
    FLOW = "Flow"
    DEPRECIATION = "Depreciation"
    ADJUSTMENT = "Adjustment"


class AmortizationStrategy(str, Enum):
    LINEAR = "Linear"
    ACCELERATED = "Accelerated"


class InitStateDto(BaseModel):
    dataDir: str
    databasePath: str


class AccountDto(BaseModel):
    id: str
    name: str
    accountType: AccountType
    purpose: AssetPurpose
    balanceCents: int
    createdAt: str
    updatedAt: str


class CreateAccountInput(BaseModel):
    name: str
    accountType: AccountType
    purpose: AssetPurpose
    initialBalanceCents: int


class TransactionDto(BaseModel):
    id: str
    amountCents: int
    fromAccountId: Optional[str] = None
    toAccountId: Optional[str] = None
    payeeId: Optional[str] = None
    categoryId: Optional[str] = None
    accrualType: AccrualType
    isAssetPurchase: bool
    note: Optional[str] = None
    occurredAt: str
    createdAt: str


class CreateTransactionInput(BaseModel):
    amountCents: int
    fromAccountId: Optional[str] = None
    toAccountId: Optional[str] = None
    payeeId: Optional[str] = None
    categoryId: Optional[str] = None
    accrualType: Optional[AccrualType] = None
    isAssetPurchase: Optional[bool] = None
    note: Optional[str] = None
    occurredAt: Optional[str] = None


class TransactionFilter(BaseModel):
    periodYm: Optional[str] = None
    accrualType: Optional[AccrualType] = None


class PagedTransactionsDto(BaseModel):
    items: list[TransactionDto]
    total: int


class AmortizationScheduleDto(BaseModel):
    id: str
    assetAccountId: str
    strategy: AmortizationStrategy
    totalPeriods: int
    residualCents: int
    startDate: str
    sourceTransactionId: str
    status: str


class CreateAssetPurchaseInput(BaseModel):
    fromAccountId: str
    assetAccountId: str
    amountCents: int
    categoryId: Optional[str] = None
    payeeId: Optional[str] = None
    note: Optional[str] = None
    occurredAt: Optional[str] = None
    strategy: AmortizationStrategy
    totalPeriods: int
    residualCents: int
    startDate: str


class AssetPurchaseResultDto(BaseModel):
    transaction: TransactionDto
    schedule: AmortizationScheduleDto


class ReconcileInput(BaseModel):
    accountId: str
    actualBalanceCents: int
    occurredAt: Optional[str] = None
    note: Optional[str] = None


class ReconcileResultDto(BaseModel):
    account: AccountDto
    deltaCents: int
    adjustmentTransaction: Optional[TransactionDto] = None


class ReportPeriodInput(BaseModel):
    periodYm: str


class ReportItemDto(BaseModel):
    label: str
    amountCents: int


class ReportDto(BaseModel):
    periodYm: str
    totalExpenseCents: int
    items: list[ReportItemDto]


class KpiPeriodInput(BaseModel):
    fromPeriodYm: Optional[str] = None
    toPeriodYm: Optional[str] = None


class AdjustmentKpiDto(BaseModel):
    adjustmentTotalCents: int
    expenseTotalCents: int
    ratio: float


class LoginInput(BaseModel):
    email: str
    password: str


class TokenRefreshInput(BaseModel):
    refreshToken: str


class AuthTokensDto(BaseModel):
    accessToken: str
    refreshToken: str
    tokenType: str = "Bearer"
    expiresIn: int


class CurrentUserDto(BaseModel):
    id: str
    email: str


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: Optional[dict] = None


class ApiError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[dict] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


def months_between(start_month: date, target_month: date) -> int:
    return (target_month.year - start_month.year) * 12 + (target_month.month - start_month.month)
