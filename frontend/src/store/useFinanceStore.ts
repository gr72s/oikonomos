import { create } from "zustand";
import {
  createAccount,
  createAssetPurchase,
  createTransaction,
  getCashFlowReport,
  getUtilityReport,
  initApp,
  listAccounts,
  listAdjustmentKpi,
  listTransactions,
  reconcileAccount,
} from "../api/finance";
import type {
  Account,
  AdjustmentKpi,
  AssetPurchaseResult,
  CreateAccountInput,
  CreateAssetPurchaseInput,
  CreateTransactionInput,
  InitState,
  ReconcileInput,
  ReconcileResult,
  Report,
  Transaction,
} from "../types/finance";

export type TabKey = "accounts" | "transactions" | "reports" | "reconcile";

interface FinanceState {
  activeTab: TabKey;
  appInfo: InitState | null;
  periodYm: string;
  accounts: Account[];
  transactions: Transaction[];
  cashReport: Report | null;
  utilityReport: Report | null;
  kpi: AdjustmentKpi | null;
  reconcileResult: ReconcileResult | null;
  loading: boolean;
  message: string | null;
  error: string | null;
  setActiveTab: (tab: TabKey) => void;
  setPeriodYm: (periodYm: string) => void;
  bootstrap: () => Promise<void>;
  refreshAll: () => Promise<void>;
  submitAccount: (input: CreateAccountInput) => Promise<void>;
  submitTransaction: (input: CreateTransactionInput) => Promise<void>;
  submitAssetPurchase: (input: CreateAssetPurchaseInput) => Promise<AssetPurchaseResult>;
  refreshReports: () => Promise<void>;
  submitReconcile: (input: ReconcileInput) => Promise<void>;
  clearNotices: () => void;
  reset: () => void;
}

const currentMonth = new Date().toISOString().slice(0, 7);

const initialState = {
  activeTab: "accounts" as TabKey,
  appInfo: null as InitState | null,
  periodYm: currentMonth,
  accounts: [] as Account[],
  transactions: [] as Transaction[],
  cashReport: null as Report | null,
  utilityReport: null as Report | null,
  kpi: null as AdjustmentKpi | null,
  reconcileResult: null as ReconcileResult | null,
  loading: false,
  message: null as string | null,
  error: null as string | null,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  ...initialState,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPeriodYm: (periodYm) => set({ periodYm }),
  clearNotices: () => set({ message: null, error: null }),
  reset: () => set({ ...initialState }),
  bootstrap: async () => {
    set({ loading: true, error: null, message: null });
    try {
      const appInfo = await initApp();
      set({ appInfo });
      await get().refreshAll();
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  refreshAll: async () => {
    const periodYm = get().periodYm;
    try {
      const [accounts, txPage, cashReport, utilityReport, kpi] = await Promise.all([
        listAccounts(),
        listTransactions({ periodYm }),
        getCashFlowReport(periodYm),
        getUtilityReport(periodYm),
        listAdjustmentKpi({ fromPeriodYm: periodYm, toPeriodYm: periodYm }),
      ]);
      set({
        accounts,
        transactions: txPage.items,
        cashReport,
        utilityReport,
        kpi,
      });
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    }
  },
  submitAccount: async (input) => {
    set({ loading: true, message: null, error: null });
    try {
      await createAccount(input);
      await get().refreshAll();
      set({ message: "Account created" });
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  submitTransaction: async (input) => {
    set({ loading: true, message: null, error: null });
    try {
      await createTransaction(input);
      await get().refreshAll();
      set({ message: "Transaction recorded" });
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  submitAssetPurchase: async (input) => {
    set({ loading: true, message: null, error: null });
    try {
      const result = await createAssetPurchase(input);
      await get().refreshAll();
      set({ message: "Asset purchase recorded" });
      return result;
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  refreshReports: async () => {
    set({ loading: true, message: null, error: null });
    try {
      const periodYm = get().periodYm;
      const [cashReport, utilityReport, kpi, txPage] = await Promise.all([
        getCashFlowReport(periodYm),
        getUtilityReport(periodYm),
        listAdjustmentKpi({ fromPeriodYm: periodYm, toPeriodYm: periodYm }),
        listTransactions({ periodYm }),
      ]);
      set({
        cashReport,
        utilityReport,
        kpi,
        transactions: txPage.items,
        message: "Reports refreshed",
      });
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  submitReconcile: async (input) => {
    set({ loading: true, message: null, error: null });
    try {
      const reconcileResult = await reconcileAccount(input);
      await get().refreshAll();
      set({ reconcileResult, message: "Reconciliation completed" });
    } catch (error) {
      set({ error: toErrorMessage(error) });
      throw error;
    } finally {
      set({ loading: false });
    }
  },
}));
