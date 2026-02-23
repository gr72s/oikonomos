export type AccountType = "Asset" | "Liability";
export type AssetPurpose =
  | "Investment"
  | "Productivity"
  | "LifeSupport"
  | "Spiritual";
export type AccrualType = "Flow" | "Depreciation" | "Adjustment";
export type AmortizationStrategy = "Linear" | "Accelerated";

export interface InitState {
  dataDir: string;
  databasePath: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CurrentUser {
  id: string;
  email: string;
}

export interface Account {
  id: string;
  name: string;
  accountType: AccountType;
  purpose: AssetPurpose;
  balanceCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  amountCents: number;
  fromAccountId: string | null;
  toAccountId: string | null;
  payeeId: string | null;
  categoryId: string | null;
  accrualType: AccrualType;
  isAssetPurchase: boolean;
  note: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface PagedTransactions {
  items: Transaction[];
  total: number;
}

export interface AmortizationSchedule {
  id: string;
  assetAccountId: string;
  strategy: AmortizationStrategy;
  totalPeriods: number;
  residualCents: number;
  startDate: string;
  sourceTransactionId: string;
  status: string;
}

export interface AssetPurchaseResult {
  transaction: Transaction;
  schedule: AmortizationSchedule;
}

export interface ReconcileResult {
  account: Account;
  deltaCents: number;
  adjustmentTransaction: Transaction | null;
}

export interface ReportItem {
  label: string;
  amountCents: number;
}

export interface Report {
  periodYm: string;
  totalExpenseCents: number;
  items: ReportItem[];
}

export interface AdjustmentKpi {
  adjustmentTotalCents: number;
  expenseTotalCents: number;
  ratio: number;
}

export interface CreateAccountInput {
  name: string;
  accountType: AccountType;
  purpose: AssetPurpose;
  initialBalanceCents: number;
}

export interface CreateTransactionInput {
  amountCents: number;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  payeeId?: string | null;
  categoryId?: string | null;
  accrualType?: AccrualType;
  isAssetPurchase?: boolean;
  note?: string | null;
  occurredAt?: string | null;
}

export interface TransactionFilter {
  periodYm?: string | null;
  accrualType?: AccrualType | null;
}

export interface CreateAssetPurchaseInput {
  fromAccountId: string;
  assetAccountId: string;
  amountCents: number;
  categoryId?: string | null;
  payeeId?: string | null;
  note?: string | null;
  occurredAt?: string | null;
  strategy: AmortizationStrategy;
  totalPeriods: number;
  residualCents: number;
  startDate: string;
}

export interface ReconcileInput {
  accountId: string;
  actualBalanceCents: number;
  occurredAt?: string | null;
  note?: string | null;
}

export interface ReportPeriodInput {
  periodYm: string;
}

export interface KpiPeriodInput {
  fromPeriodYm?: string | null;
  toPeriodYm?: string | null;
}
