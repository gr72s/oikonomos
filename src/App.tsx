import { useEffect, useMemo, useState } from "react";
import "./App.css";
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
} from "./lib/api";
import type {
  Account,
  AccountType,
  AdjustmentKpi,
  AssetPurpose,
  InitState,
  Report,
  ReconcileResult,
  Transaction,
} from "./types/finance";

type TabKey = "accounts" | "transactions" | "reports" | "reconcile";

const PURPOSES: AssetPurpose[] = [
  "Investment",
  "Productivity",
  "LifeSupport",
  "Spiritual",
];
const ACCOUNT_TYPES: AccountType[] = ["Asset", "Liability"];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const CURRENT_DAY = new Date().toISOString().slice(0, 10);

function centsToDisplay(value: number): string {
  return (value / 100).toFixed(2);
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("accounts");
  const [appInfo, setAppInfo] = useState<InitState | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cashReport, setCashReport] = useState<Report | null>(null);
  const [utilityReport, setUtilityReport] = useState<Report | null>(null);
  const [kpi, setKpi] = useState<AdjustmentKpi | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(
    null,
  );
  const [periodYm, setPeriodYm] = useState(CURRENT_MONTH);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("Asset");
  const [purpose, setPurpose] = useState<AssetPurpose>("LifeSupport");
  const [initialBalanceCents, setInitialBalanceCents] = useState("0");

  const [txAmountCents, setTxAmountCents] = useState("");
  const [txFromAccountId, setTxFromAccountId] = useState("");
  const [txToAccountId, setTxToAccountId] = useState("");
  const [txNote, setTxNote] = useState("");
  const [isAssetPurchase, setIsAssetPurchase] = useState(false);
  const [assetStrategy, setAssetStrategy] = useState<"Linear" | "Accelerated">(
    "Linear",
  );
  const [assetTotalPeriods, setAssetTotalPeriods] = useState("48");
  const [assetResidualCents, setAssetResidualCents] = useState("0");
  const [assetStartDate, setAssetStartDate] = useState(CURRENT_DAY);

  const [reconcileAccountId, setReconcileAccountId] = useState("");
  const [actualBalanceCents, setActualBalanceCents] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");

  const defaultFromAccountId = useMemo(
    () => accounts.find((acc) => acc.accountType === "Asset")?.id ?? "",
    [accounts],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!txFromAccountId && defaultFromAccountId) {
      setTxFromAccountId(defaultFromAccountId);
    }
    if (!reconcileAccountId && accounts.length > 0) {
      setReconcileAccountId(accounts[0].id);
    }
  }, [accounts, defaultFromAccountId, txFromAccountId, reconcileAccountId]);

  async function bootstrap() {
    setWorking(true);
    setError(null);
    try {
      const info = await initApp();
      setAppInfo(info);
      await refreshAll();
    } catch (err) {
      setError(String(err));
    } finally {
      setWorking(false);
    }
  }

  async function refreshAll() {
    const [nextAccounts, txPage, nextCash, nextUtility, nextKpi] =
      await Promise.all([
        listAccounts(),
        listTransactions({ periodYm }),
        getCashFlowReport({ periodYm }),
        getUtilityReport({ periodYm }),
        listAdjustmentKpi({ fromPeriodYm: periodYm, toPeriodYm: periodYm }),
      ]);
    setAccounts(nextAccounts);
    setTransactions(txPage.items);
    setCashReport(nextCash);
    setUtilityReport(nextUtility);
    setKpi(nextKpi);
  }

  function startAction() {
    setWorking(true);
    setMessage(null);
    setError(null);
  }

  function finishAction() {
    setWorking(false);
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    startAction();
    try {
      await createAccount({
        name: accountName,
        accountType,
        purpose,
        initialBalanceCents: Number.parseInt(initialBalanceCents, 10) || 0,
      });
      setAccountName("");
      setInitialBalanceCents("0");
      setMessage("账户已创建");
      await refreshAll();
    } catch (err) {
      setError(String(err));
    } finally {
      finishAction();
    }
  }

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    startAction();
    try {
      const amount = Number.parseInt(txAmountCents, 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("请输入有效金额（分）");
      }
      if (isAssetPurchase) {
        if (!txFromAccountId || !txToAccountId) {
          throw new Error("资产购买需要 from/to 账户");
        }
        await createAssetPurchase({
          fromAccountId: txFromAccountId,
          assetAccountId: txToAccountId,
          amountCents: amount,
          strategy: assetStrategy,
          totalPeriods: Number.parseInt(assetTotalPeriods, 10),
          residualCents: Number.parseInt(assetResidualCents, 10) || 0,
          startDate: assetStartDate,
          note: txNote || null,
          occurredAt: new Date().toISOString(),
        });
      } else {
        await createTransaction({
          amountCents: amount,
          fromAccountId: txFromAccountId || null,
          toAccountId: txToAccountId || null,
          note: txNote || null,
          occurredAt: new Date().toISOString(),
          accrualType: "Flow",
        });
      }

      setTxAmountCents("");
      setTxNote("");
      setMessage("交易已记录");
      await refreshAll();
    } catch (err) {
      setError(String(err));
    } finally {
      finishAction();
    }
  }

  async function handleRefreshReports() {
    startAction();
    try {
      const [nextCash, nextUtility, nextKpi, nextTx] = await Promise.all([
        getCashFlowReport({ periodYm }),
        getUtilityReport({ periodYm }),
        listAdjustmentKpi({ fromPeriodYm: periodYm, toPeriodYm: periodYm }),
        listTransactions({ periodYm }),
      ]);
      setCashReport(nextCash);
      setUtilityReport(nextUtility);
      setKpi(nextKpi);
      setTransactions(nextTx.items);
      setMessage("报表已刷新");
    } catch (err) {
      setError(String(err));
    } finally {
      finishAction();
    }
  }

  async function handleReconcile(e: React.FormEvent) {
    e.preventDefault();
    startAction();
    try {
      if (!reconcileAccountId) {
        throw new Error("请选择账户");
      }
      const actual = Number.parseInt(actualBalanceCents, 10);
      if (!Number.isFinite(actual)) {
        throw new Error("请输入有效余额（分）");
      }
      const result = await reconcileAccount({
        accountId: reconcileAccountId,
        actualBalanceCents: actual,
        note: reconcileNote || null,
        occurredAt: new Date().toISOString(),
      });
      setReconcileResult(result);
      setMessage("对账完成");
      setActualBalanceCents("");
      setReconcileNote("");
      await refreshAll();
    } catch (err) {
      setError(String(err));
    } finally {
      finishAction();
    }
  }

  return (
    <main className="app-shell">
      <header className="top">
        <div>
          <h1>Oikonomos</h1>
          <p className="meta">
            Database: {appInfo?.databasePath ?? "loading..."} | Month: {periodYm}
          </p>
        </div>
        <nav className="tabs">
          {(["accounts", "transactions", "reports", "reconcile"] as TabKey[]).map(
            (tab) => (
              <button
                key={tab}
                className={tab === activeTab ? "tab active" : "tab"}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tab}
              </button>
            ),
          )}
        </nav>
      </header>

      {message && <p className="notice ok">{message}</p>}
      {error && <p className="notice err">{error}</p>}
      {working && <p className="notice">处理中...</p>}

      {activeTab === "accounts" && (
        <section className="panel">
          <h2>账户管理</h2>
          <form className="grid-form" onSubmit={handleCreateAccount}>
            <label>
              Name
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.currentTarget.value)}
                required
              />
            </label>
            <label>
              Type
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.currentTarget.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Purpose
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.currentTarget.value as AssetPurpose)}
              >
                {PURPOSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Initial Balance (cents)
              <input
                value={initialBalanceCents}
                onChange={(e) => setInitialBalanceCents(e.currentTarget.value)}
                required
              />
            </label>
            <button className="primary" type="submit" disabled={working}>
              Create Account
            </button>
          </form>

          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Balance (cents)</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{account.accountType}</td>
                  <td>{account.purpose}</td>
                  <td>{account.balanceCents}</td>
                  <td>{centsToDisplay(account.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "transactions" && (
        <section className="panel">
          <h2>交易录入</h2>
          <form className="grid-form" onSubmit={handleCreateTransaction}>
            <label>
              Amount (cents)
              <input
                value={txAmountCents}
                onChange={(e) => setTxAmountCents(e.currentTarget.value)}
                required
              />
            </label>
            <label>
              From Account
              <select
                value={txFromAccountId}
                onChange={(e) => setTxFromAccountId(e.currentTarget.value)}
              >
                <option value="">(none)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To Account
              <select
                value={txToAccountId}
                onChange={(e) => setTxToAccountId(e.currentTarget.value)}
              >
                <option value="">(none)</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Note
              <input
                value={txNote}
                onChange={(e) => setTxNote(e.currentTarget.value)}
              />
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={isAssetPurchase}
                onChange={(e) => setIsAssetPurchase(e.currentTarget.checked)}
              />
              Asset Purchase
            </label>

            {isAssetPurchase && (
              <>
                <label>
                  Strategy
                  <select
                    value={assetStrategy}
                    onChange={(e) =>
                      setAssetStrategy(
                        e.currentTarget.value as "Linear" | "Accelerated",
                      )
                    }
                  >
                    <option value="Linear">Linear</option>
                    <option value="Accelerated">Accelerated</option>
                  </select>
                </label>
                <label>
                  Total Periods
                  <input
                    value={assetTotalPeriods}
                    onChange={(e) => setAssetTotalPeriods(e.currentTarget.value)}
                    required
                  />
                </label>
                <label>
                  Residual (cents)
                  <input
                    value={assetResidualCents}
                    onChange={(e) => setAssetResidualCents(e.currentTarget.value)}
                    required
                  />
                </label>
                <label>
                  Start Date
                  <input
                    type="date"
                    value={assetStartDate}
                    onChange={(e) => setAssetStartDate(e.currentTarget.value)}
                    required
                  />
                </label>
              </>
            )}

            <button className="primary" type="submit" disabled={working}>
              Submit Transaction
            </button>
          </form>

          <h3>当月交易</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Type</th>
                <th>Amount (cents)</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.occurredAt.slice(0, 19)}</td>
                  <td>{tx.accrualType}</td>
                  <td>{tx.amountCents}</td>
                  <td>{tx.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {activeTab === "reports" && (
        <section className="panel">
          <h2>报表</h2>
          <div className="toolbar">
            <label>
              Period
              <input
                type="month"
                value={periodYm}
                onChange={(e) => setPeriodYm(e.currentTarget.value)}
              />
            </label>
            <button className="primary" type="button" onClick={handleRefreshReports}>
              Refresh
            </button>
          </div>

          <div className="cards">
            <article className="card">
              <h3>Cash-Centric</h3>
              <p className="big">{cashReport?.totalExpenseCents ?? 0} cents</p>
              <ul>
                {cashReport?.items.map((item) => (
                  <li key={`cash-${item.label}`}>
                    {item.label}: {item.amountCents}
                  </li>
                ))}
              </ul>
            </article>
            <article className="card">
              <h3>Utility-Centric</h3>
              <p className="big">{utilityReport?.totalExpenseCents ?? 0} cents</p>
              <ul>
                {utilityReport?.items.map((item) => (
                  <li key={`utility-${item.label}`}>
                    {item.label}: {item.amountCents}
                  </li>
                ))}
              </ul>
            </article>
            <article className="card">
              <h3>Adjustment KPI</h3>
              <p>Adjustment: {kpi?.adjustmentTotalCents ?? 0} cents</p>
              <p>Expense: {kpi?.expenseTotalCents ?? 0} cents</p>
              <p>Ratio: {((kpi?.ratio ?? 0) * 100).toFixed(2)}%</p>
            </article>
          </div>
        </section>
      )}

      {activeTab === "reconcile" && (
        <section className="panel">
          <h2>对账</h2>
          <form className="grid-form" onSubmit={handleReconcile}>
            <label>
              Account
              <select
                value={reconcileAccountId}
                onChange={(e) => setReconcileAccountId(e.currentTarget.value)}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Actual Balance (cents)
              <input
                value={actualBalanceCents}
                onChange={(e) => setActualBalanceCents(e.currentTarget.value)}
                required
              />
            </label>
            <label>
              Note
              <input
                value={reconcileNote}
                onChange={(e) => setReconcileNote(e.currentTarget.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={working}>
              Reconcile
            </button>
          </form>
          {reconcileResult && (
            <div className="card">
              <h3>结果</h3>
              <p>Delta: {reconcileResult.deltaCents} cents</p>
              <p>
                Adjustment Tx:{" "}
                {reconcileResult.adjustmentTransaction?.id ?? "No adjustment needed"}
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
