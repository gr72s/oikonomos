import { invoke } from "@tauri-apps/api/core";
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
  ReportPeriodInput,
  TransactionFilter,
  Transaction,
} from "../types/finance";

function cmd<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args);
}

export function initApp(): Promise<InitState> {
  return cmd<InitState>("init_app");
}

export function listAccounts(): Promise<Account[]> {
  return cmd<Account[]>("list_accounts");
}

export function createAccount(input: CreateAccountInput): Promise<Account> {
  return cmd<Account>("create_account", { input });
}

export function createTransaction(
  input: CreateTransactionInput,
): Promise<Transaction> {
  return cmd<Transaction>("create_transaction", { input });
}

export function listTransactions(
  filter?: TransactionFilter,
): Promise<PagedTransactions> {
  return cmd<PagedTransactions>("list_transactions", { filter: filter ?? null });
}

export function createAssetPurchase(
  input: CreateAssetPurchaseInput,
): Promise<AssetPurchaseResult> {
  return cmd<AssetPurchaseResult>("create_asset_purchase", { input });
}

export function reconcileAccount(input: ReconcileInput): Promise<ReconcileResult> {
  return cmd<ReconcileResult>("reconcile_account", { input });
}

export function getCashFlowReport(input: ReportPeriodInput): Promise<Report> {
  return cmd<Report>("get_cash_flow_report", { input });
}

export function getUtilityReport(input: ReportPeriodInput): Promise<Report> {
  return cmd<Report>("get_utility_report", { input });
}

export function listAdjustmentKpi(input?: KpiPeriodInput): Promise<AdjustmentKpi> {
  return cmd<AdjustmentKpi>("list_adjustment_kpi", { input: input ?? null });
}
