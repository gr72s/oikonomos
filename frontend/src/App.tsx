import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { useFinanceStore, type TabKey } from "./store/useFinanceStore";
import type { AccountType, AssetPurpose } from "./types/finance";

const PURPOSES: AssetPurpose[] = [
  "Investment",
  "Productivity",
  "LifeSupport",
  "Spiritual",
];
const ACCOUNT_TYPES: AccountType[] = ["Asset", "Liability"];
const CURRENT_DAY = new Date().toISOString().slice(0, 10);

function centsToDisplay(value: number): string {
  return (value / 100).toFixed(2);
}

function App() {
  const {
    activeTab,
    appInfo,
    periodYm,
    accounts,
    transactions,
    cashReport,
    utilityReport,
    kpi,
    reconcileResult,
    loading,
    message,
    error,
    setActiveTab,
    setPeriodYm,
    bootstrap,
    submitAccount,
    submitTransaction,
    submitAssetPurchase,
    refreshReports,
    submitReconcile,
    clearNotices,
  } = useFinanceStore();

  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("Asset");
  const [purpose, setPurpose] = useState<AssetPurpose>("LifeSupport");
  const [initialBalanceCents, setInitialBalanceCents] = useState("0");

  const [txAmountCents, setTxAmountCents] = useState("");
  const [txFromAccountId, setTxFromAccountId] = useState("");
  const [txToAccountId, setTxToAccountId] = useState("");
  const [txNote, setTxNote] = useState("");
  const [isAssetPurchase, setIsAssetPurchase] = useState(false);
  const [assetStrategy, setAssetStrategy] = useState<"Linear" | "Accelerated">("Linear");
  const [assetTotalPeriods, setAssetTotalPeriods] = useState("48");
  const [assetResidualCents, setAssetResidualCents] = useState("0");
  const [assetStartDate, setAssetStartDate] = useState(CURRENT_DAY);

  const [reconcileAccountId, setReconcileAccountId] = useState("");
  const [actualBalanceCents, setActualBalanceCents] = useState("");
  const [reconcileNote, setReconcileNote] = useState("");

  const defaultFromAccountId = useMemo(
    () => accounts.find((account) => account.accountType === "Asset")?.id ?? "",
    [accounts],
  );

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!txFromAccountId && defaultFromAccountId) {
      setTxFromAccountId(defaultFromAccountId);
    }
    if (!reconcileAccountId && accounts.length > 0) {
      setReconcileAccountId(accounts[0].id);
    }
  }, [accounts, defaultFromAccountId, txFromAccountId, reconcileAccountId]);

  const handleTabChange = (_: unknown, value: TabKey) => {
    setActiveTab(value);
    clearNotices();
  };

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    await submitAccount({
      name: accountName,
      accountType,
      purpose,
      initialBalanceCents: Number.parseInt(initialBalanceCents, 10) || 0,
    });
    setAccountName("");
    setInitialBalanceCents("0");
  }

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number.parseInt(txAmountCents, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    if (isAssetPurchase) {
      if (!txFromAccountId || !txToAccountId) {
        return;
      }
      await submitAssetPurchase({
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
      await submitTransaction({
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
  }

  async function handleReconcile(e: React.FormEvent) {
    e.preventDefault();
    const actual = Number.parseInt(actualBalanceCents, 10);
    if (!reconcileAccountId || !Number.isFinite(actual)) {
      return;
    }

    await submitReconcile({
      accountId: reconcileAccountId,
      actualBalanceCents: actual,
      note: reconcileNote || null,
      occurredAt: new Date().toISOString(),
    });
    setActualBalanceCents("");
    setReconcileNote("");
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f4f6f8", pb: 4 }}>
      <AppBar position="static">
        <Toolbar sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, py: 1 }}>
          <Typography variant="h6">Oikonomos</Typography>
          <Typography variant="body2">
            Database: {appInfo?.databasePath ?? "loading..."} | Month: {periodYm}
          </Typography>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            textColor="inherit"
            indicatorColor="secondary"
          >
            <Tab value="accounts" label="Accounts" />
            <Tab value="transactions" label="Transactions" />
            <Tab value="reports" label="Reports" />
            <Tab value="reconcile" label="Reconcile" />
          </Tabs>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 3 }}>
        <Stack spacing={2}>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {loading && <Alert severity="info">Processing...</Alert>}

          {activeTab === "accounts" && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Account Management
                </Typography>
                <Box component="form" onSubmit={handleCreateAccount} sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", mb: 3 }}>
                  <TextField
                    label="Name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.currentTarget.value)}
                    required
                  />
                  <FormControl>
                    <InputLabel id="account-type-label">Type</InputLabel>
                    <Select
                      labelId="account-type-label"
                      value={accountType}
                      label="Type"
                      onChange={(e) => setAccountType(e.target.value as AccountType)}
                    >
                      {ACCOUNT_TYPES.map((value) => (
                        <MenuItem key={value} value={value}>
                          {value}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <InputLabel id="purpose-label">Purpose</InputLabel>
                    <Select
                      labelId="purpose-label"
                      value={purpose}
                      label="Purpose"
                      onChange={(e) => setPurpose(e.target.value as AssetPurpose)}
                    >
                      {PURPOSES.map((value) => (
                        <MenuItem key={value} value={value}>
                          {value}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Initial Balance (cents)"
                    value={initialBalanceCents}
                    onChange={(e) => setInitialBalanceCents(e.currentTarget.value)}
                    required
                  />
                  <Button type="submit" variant="contained" disabled={loading}>
                    Create Account
                  </Button>
                </Box>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Purpose</TableCell>
                      <TableCell>Balance (cents)</TableCell>
                      <TableCell>Balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>{account.name}</TableCell>
                        <TableCell>{account.accountType}</TableCell>
                        <TableCell>{account.purpose}</TableCell>
                        <TableCell>{account.balanceCents}</TableCell>
                        <TableCell>{centsToDisplay(account.balanceCents)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeTab === "transactions" && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Transaction Entry
                </Typography>
                <Box component="form" onSubmit={handleCreateTransaction} sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", mb: 3 }}>
                  <TextField
                    label="Amount (cents)"
                    value={txAmountCents}
                    onChange={(e) => setTxAmountCents(e.currentTarget.value)}
                    required
                  />
                  <FormControl>
                    <InputLabel id="from-account-label">From Account</InputLabel>
                    <Select
                      labelId="from-account-label"
                      value={txFromAccountId}
                      label="From Account"
                      onChange={(e) => setTxFromAccountId(e.target.value)}
                    >
                      <MenuItem value="">(none)</MenuItem>
                      {accounts.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <InputLabel id="to-account-label">To Account</InputLabel>
                    <Select
                      labelId="to-account-label"
                      value={txToAccountId}
                      label="To Account"
                      onChange={(e) => setTxToAccountId(e.target.value)}
                    >
                      <MenuItem value="">(none)</MenuItem>
                      {accounts.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Note"
                    value={txNote}
                    onChange={(e) => setTxNote(e.currentTarget.value)}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={isAssetPurchase}
                        onChange={(e) => setIsAssetPurchase(e.target.checked)}
                      />
                    }
                    label="Asset Purchase"
                  />

                  {isAssetPurchase && (
                    <>
                      <FormControl>
                        <InputLabel id="strategy-label">Strategy</InputLabel>
                        <Select
                          labelId="strategy-label"
                          value={assetStrategy}
                          label="Strategy"
                          onChange={(e) => setAssetStrategy(e.target.value as "Linear" | "Accelerated")}
                        >
                          <MenuItem value="Linear">Linear</MenuItem>
                          <MenuItem value="Accelerated">Accelerated</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        label="Total Periods"
                        value={assetTotalPeriods}
                        onChange={(e) => setAssetTotalPeriods(e.currentTarget.value)}
                        required
                      />
                      <TextField
                        label="Residual (cents)"
                        value={assetResidualCents}
                        onChange={(e) => setAssetResidualCents(e.currentTarget.value)}
                        required
                      />
                      <TextField
                        type="date"
                        label="Start Date"
                        value={assetStartDate}
                        onChange={(e) => setAssetStartDate(e.currentTarget.value)}
                        InputLabelProps={{ shrink: true }}
                        required
                      />
                    </>
                  )}

                  <Button type="submit" variant="contained" disabled={loading}>
                    Submit Transaction
                  </Button>
                </Box>

                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Current Period Transactions
                </Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Occurred</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Amount (cents)</TableCell>
                      <TableCell>Note</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{tx.occurredAt.slice(0, 19)}</TableCell>
                        <TableCell>{tx.accrualType}</TableCell>
                        <TableCell>{tx.amountCents}</TableCell>
                        <TableCell>{tx.note ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {activeTab === "reports" && (
            <Stack spacing={2}>
              <Card>
                <CardContent>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                    <TextField
                      type="month"
                      label="Period"
                      value={periodYm}
                      onChange={(e) => setPeriodYm(e.currentTarget.value)}
                      InputLabelProps={{ shrink: true }}
                    />
                    <Button variant="contained" onClick={() => void refreshReports()} disabled={loading}>
                      Refresh
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6">Cash-Centric</Typography>
                    <Typography variant="h5" sx={{ my: 1 }}>
                      {cashReport?.totalExpenseCents ?? 0} cents
                    </Typography>
                    {cashReport?.items.map((item) => (
                      <Typography key={`cash-${item.label}`} variant="body2">
                        {item.label}: {item.amountCents}
                      </Typography>
                    ))}
                  </CardContent>
                </Card>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6">Utility-Centric</Typography>
                    <Typography variant="h5" sx={{ my: 1 }}>
                      {utilityReport?.totalExpenseCents ?? 0} cents
                    </Typography>
                    {utilityReport?.items.map((item) => (
                      <Typography key={`utility-${item.label}`} variant="body2">
                        {item.label}: {item.amountCents}
                      </Typography>
                    ))}
                  </CardContent>
                </Card>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography variant="h6">Adjustment KPI</Typography>
                    <Typography variant="body1">Adjustment: {kpi?.adjustmentTotalCents ?? 0} cents</Typography>
                    <Typography variant="body1">Expense: {kpi?.expenseTotalCents ?? 0} cents</Typography>
                    <Typography variant="body1">Ratio: {((kpi?.ratio ?? 0) * 100).toFixed(2)}%</Typography>
                  </CardContent>
                </Card>
              </Stack>
            </Stack>
          )}

          {activeTab === "reconcile" && (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Reconciliation
                </Typography>
                <Box component="form" onSubmit={handleReconcile} sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", mb: 3 }}>
                  <FormControl>
                    <InputLabel id="reconcile-account-label">Account</InputLabel>
                    <Select
                      labelId="reconcile-account-label"
                      value={reconcileAccountId}
                      label="Account"
                      onChange={(e) => setReconcileAccountId(e.target.value)}
                      required
                    >
                      {accounts.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          {account.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Actual Balance (cents)"
                    value={actualBalanceCents}
                    onChange={(e) => setActualBalanceCents(e.currentTarget.value)}
                    required
                  />
                  <TextField
                    label="Note"
                    value={reconcileNote}
                    onChange={(e) => setReconcileNote(e.currentTarget.value)}
                  />
                  <Button type="submit" variant="contained" disabled={loading}>
                    Reconcile
                  </Button>
                </Box>

                {reconcileResult && (
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle1">Result</Typography>
                      <Typography>Delta: {reconcileResult.deltaCents} cents</Typography>
                      <Typography>
                        Adjustment Tx: {reconcileResult.adjustmentTransaction?.id ?? "No adjustment needed"}
                      </Typography>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          )}
        </Stack>
      </Container>
    </Box>
  );
}

export default App;
