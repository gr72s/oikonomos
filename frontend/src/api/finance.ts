import { apiGet, apiPost } from "./client";
import type {
  Account,
  AdjustmentKpi,
  AssetPurchaseResult,
  CreateAccountInput,
  CreateAssetPurchaseInput,
  CreateTransactionInput,
  InitState,
  KpiPeriodInput,
  PagedTransactions,
  ReconcileInput,
  ReconcileResult,
  Report,
  Transaction,
  TransactionFilter,
} from "../types/finance";

export function initApp(): Promise<InitState> {
  return apiGet<InitState>("/system/init");
}

export function listAccounts(): Promise<Account[]> {
  return apiGet<Account[]>("/accounts");
}

export function createAccount(input: CreateAccountInput): Promise<Account> {
  return apiPost<Account>("/accounts", input);
}

export function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  return apiPost<Transaction>("/transactions", input);
}

export function listTransactions(filter?: TransactionFilter): Promise<PagedTransactions> {
  return apiGet<PagedTransactions>("/transactions", {
    periodYm: filter?.periodYm ?? undefined,
    accrualType: filter?.accrualType ?? undefined,
  });
}

export function createAssetPurchase(input: CreateAssetPurchaseInput): Promise<AssetPurchaseResult> {
  return apiPost<AssetPurchaseResult>("/asset-purchases", input);
}

export function reconcileAccount(input: ReconcileInput): Promise<ReconcileResult> {
  return apiPost<ReconcileResult>("/reconciliations", input);
}

export function getCashFlowReport(periodYm: string): Promise<Report> {
  return apiGet<Report>("/reports/cash", { periodYm });
}

export function getUtilityReport(periodYm: string): Promise<Report> {
  return apiGet<Report>("/reports/utility", { periodYm });
}

export function listAdjustmentKpi(input?: KpiPeriodInput): Promise<AdjustmentKpi> {
  return apiGet<AdjustmentKpi>("/kpis/adjustment", {
    fromPeriodYm: input?.fromPeriodYm ?? undefined,
    toPeriodYm: input?.toPeriodYm ?? undefined,
  });
}
