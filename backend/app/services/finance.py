from __future__ import annotations

import sqlite3
import uuid
from datetime import date
from typing import Optional

from app.db import (
    get_connection,
    normalize_timestamp,
    now_utc_rfc3339,
    parse_date_ymd,
    parse_period,
    transaction,
)
from app.models import (
    AccountDto,
    AccountType,
    AccrualType,
    AdjustmentKpiDto,
    AmortizationScheduleDto,
    AmortizationStrategy,
    ApiError,
    AssetPurchaseResultDto,
    CreateAccountInput,
    CreateAssetPurchaseInput,
    CreateTransactionInput,
    KpiPeriodInput,
    PagedTransactionsDto,
    ReconcileInput,
    ReconcileResultDto,
    ReportDto,
    ReportItemDto,
    TransactionDto,
    months_between,
)


def _account_from_row(row: sqlite3.Row) -> AccountDto:
    return AccountDto(
        id=row["id"],
        name=row["name"],
        accountType=row["type"],
        purpose=row["purpose"],
        balanceCents=row["balance_cents"],
        createdAt=row["created_at"],
        updatedAt=row["updated_at"],
    )


def _transaction_from_row(row: sqlite3.Row) -> TransactionDto:
    return TransactionDto(
        id=row["id"],
        amountCents=row["amount_cents"],
        fromAccountId=row["from_account_id"],
        toAccountId=row["to_account_id"],
        payeeId=row["payee_id"],
        categoryId=row["category_id"],
        accrualType=row["accrual_type"],
        isAssetPurchase=bool(row["is_asset_purchase"]),
        note=row["note"],
        occurredAt=row["occurred_at"],
        createdAt=row["created_at"],
    )


def _schedule_from_row(row: sqlite3.Row) -> AmortizationScheduleDto:
    return AmortizationScheduleDto(
        id=row["id"],
        assetAccountId=row["asset_account_id"],
        strategy=row["strategy"],
        totalPeriods=row["total_periods"],
        residualCents=row["residual_cents"],
        startDate=row["start_date"],
        sourceTransactionId=row["source_transaction_id"],
        status=row["status"],
    )


def _load_account(conn: sqlite3.Connection, account_id: str) -> AccountDto:
    row = conn.execute(
        "SELECT id, name, type, purpose, balance_cents, created_at, updated_at FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if row is None:
        raise ApiError("not_found", f"account not found: {account_id}", status_code=404)
    return _account_from_row(row)


def _load_transaction(conn: sqlite3.Connection, tx_id: str) -> TransactionDto:
    row = conn.execute(
        """
        SELECT id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
               accrual_type, is_asset_purchase, note, occurred_at, created_at
        FROM transactions
        WHERE id = ?
        """,
        (tx_id,),
    ).fetchone()
    if row is None:
        raise ApiError("not_found", f"transaction not found: {tx_id}", status_code=404)
    return _transaction_from_row(row)


def _load_schedule(conn: sqlite3.Connection, schedule_id: str) -> AmortizationScheduleDto:
    row = conn.execute(
        """
        SELECT id, asset_account_id, strategy, total_periods, residual_cents,
               start_date, source_transaction_id, status
        FROM amortization_schedules
        WHERE id = ?
        """,
        (schedule_id,),
    ).fetchone()
    if row is None:
        raise ApiError("not_found", f"schedule not found: {schedule_id}", status_code=404)
    return _schedule_from_row(row)


def _apply_balance_delta(conn: sqlite3.Connection, account_id: str, delta: int) -> None:
    updated = conn.execute(
        "UPDATE accounts SET balance_cents = balance_cents + ?, updated_at = ? WHERE id = ?",
        (delta, now_utc_rfc3339(), account_id),
    ).rowcount
    if updated == 0:
        raise ApiError("not_found", f"account not found: {account_id}", status_code=404)

    row = conn.execute("SELECT type, balance_cents FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if row is None:
        raise ApiError("not_found", f"account not found: {account_id}", status_code=404)
    if row["type"] == AccountType.LIABILITY.value and row["balance_cents"] > 0:
        raise ApiError("invalid_input", f"liability account balance cannot be positive: {account_id}")


def _calculate_depreciation_amount(
    strategy: AmortizationStrategy,
    depreciable_cents: int,
    total_periods: int,
    period_index: int,
) -> int:
    if (
        depreciable_cents <= 0
        or total_periods <= 0
        or period_index < 0
        or period_index >= total_periods
    ):
        return 0

    if strategy == AmortizationStrategy.LINEAR:
        base = depreciable_cents // total_periods
        if period_index == total_periods - 1:
            return base + depreciable_cents % total_periods
        return base

    weight_sum = total_periods * (total_periods + 1) // 2
    if period_index == total_periods - 1:
        allocated = 0
        for i in range(period_index):
            weight = total_periods - i
            allocated += (depreciable_cents * weight) // weight_sum
        return depreciable_cents - allocated

    weight = total_periods - period_index
    return (depreciable_cents * weight) // weight_sum


def ensure_depreciation_for_period(conn: sqlite3.Connection, period_ym: str) -> None:
    period_start, period_start_ts, _ = parse_period(period_ym)
    schedules = conn.execute(
        """
        SELECT s.id, s.strategy, s.total_periods, s.residual_cents, s.start_date, t.amount_cents
        FROM amortization_schedules s
        JOIN transactions t ON t.id = s.source_transaction_id
        WHERE s.status = 'Active'
        """
    ).fetchall()

    for row in schedules:
        schedule_id = row["id"]
        strategy = AmortizationStrategy(row["strategy"])
        total_periods = int(row["total_periods"])
        residual_cents = int(row["residual_cents"])
        purchase_amount = int(row["amount_cents"])
        start = parse_date_ymd(row["start_date"], "startDate")
        start_month = date(start.year, start.month, 1)
        period_index = months_between(start_month, period_start)
        if period_index < 0 or period_index >= total_periods:
            continue

        existing = conn.execute(
            "SELECT id FROM amortization_postings WHERE schedule_id = ? AND period_ym = ?",
            (schedule_id, period_ym),
        ).fetchone()
        if existing is not None:
            continue

        amount = _calculate_depreciation_amount(
            strategy=strategy,
            depreciable_cents=purchase_amount - residual_cents,
            total_periods=total_periods,
            period_index=period_index,
        )
        if amount <= 0:
            continue

        depreciation_tx_id = str(uuid.uuid4())
        now = now_utc_rfc3339()
        conn.execute(
            """
            INSERT INTO transactions (
                id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                accrual_type, is_asset_purchase, note, occurred_at, created_at
            ) VALUES (?, ?, NULL, NULL, NULL, NULL, 'Depreciation', 0, ?, ?, ?)
            """,
            (depreciation_tx_id, amount, f"Depreciation for {period_ym}", period_start_ts, now),
        )
        conn.execute(
            """
            INSERT INTO amortization_postings (id, schedule_id, period_ym, amount_cents, transaction_id, generated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), schedule_id, period_ym, amount, depreciation_tx_id, now),
        )

        if period_index == total_periods - 1:
            conn.execute(
                "UPDATE amortization_schedules SET status = 'Completed' WHERE id = ?",
                (schedule_id,),
            )


def init_state() -> dict:
    from app.config import get_data_dir, get_db_path

    return {
        "dataDir": str(get_data_dir()),
        "databasePath": str(get_db_path()),
    }


def list_accounts() -> list[AccountDto]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, type, purpose, balance_cents, created_at, updated_at FROM accounts ORDER BY name ASC"
        ).fetchall()
        return [_account_from_row(row) for row in rows]


def create_account(input_data: CreateAccountInput) -> AccountDto:
    if not input_data.name.strip():
        raise ApiError("invalid_input", "account name cannot be empty")
    if input_data.accountType == AccountType.LIABILITY and input_data.initialBalanceCents > 0:
        raise ApiError("invalid_input", "liability initial balance must be <= 0")

    account_id = str(uuid.uuid4())
    now = now_utc_rfc3339()

    with get_connection() as conn:
        with transaction(conn):
            conn.execute(
                """
                INSERT INTO accounts (id, name, type, purpose, balance_cents, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    input_data.name.strip(),
                    input_data.accountType.value,
                    input_data.purpose.value,
                    input_data.initialBalanceCents,
                    now,
                    now,
                ),
            )
        return _load_account(conn, account_id)


def create_transaction(input_data: CreateTransactionInput) -> TransactionDto:
    if input_data.amountCents <= 0:
        raise ApiError("invalid_input", "amountCents must be greater than 0")

    accrual_type = input_data.accrualType or AccrualType.FLOW
    if (
        accrual_type != AccrualType.DEPRECIATION
        and input_data.fromAccountId is None
        and input_data.toAccountId is None
    ):
        raise ApiError("invalid_input", "non-depreciation transaction needs from/to account")

    tx_id = str(uuid.uuid4())
    occurred_at = normalize_timestamp(input_data.occurredAt)

    with get_connection() as conn:
        with transaction(conn):
            conn.execute(
                """
                INSERT INTO transactions (
                    id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                    accrual_type, is_asset_purchase, note, occurred_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tx_id,
                    input_data.amountCents,
                    input_data.fromAccountId,
                    input_data.toAccountId,
                    input_data.payeeId,
                    input_data.categoryId,
                    accrual_type.value,
                    1 if input_data.isAssetPurchase else 0,
                    input_data.note,
                    occurred_at,
                    now_utc_rfc3339(),
                ),
            )

            if accrual_type != AccrualType.DEPRECIATION:
                if input_data.fromAccountId is not None:
                    _apply_balance_delta(conn, input_data.fromAccountId, -input_data.amountCents)
                if input_data.toAccountId is not None:
                    _apply_balance_delta(conn, input_data.toAccountId, input_data.amountCents)

        return _load_transaction(conn, tx_id)


def list_transactions(period_ym: Optional[str], accrual_type: Optional[AccrualType]) -> PagedTransactionsDto:
    if period_ym is not None:
        parse_period(period_ym)

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                   accrual_type, is_asset_purchase, note, occurred_at, created_at
            FROM transactions
            WHERE (? IS NULL OR substr(occurred_at, 1, 7) = ?)
              AND (? IS NULL OR accrual_type = ?)
            ORDER BY occurred_at DESC, created_at DESC
            """,
            (
                period_ym,
                period_ym,
                None if accrual_type is None else accrual_type.value,
                None if accrual_type is None else accrual_type.value,
            ),
        ).fetchall()

        items = [_transaction_from_row(row) for row in rows]
        return PagedTransactionsDto(items=items, total=len(items))


def create_asset_purchase(input_data: CreateAssetPurchaseInput) -> AssetPurchaseResultDto:
    if input_data.amountCents <= 0:
        raise ApiError("invalid_input", "amountCents must be greater than 0")
    if input_data.totalPeriods <= 0:
        raise ApiError("invalid_input", "totalPeriods must be greater than 0")
    if input_data.residualCents < 0 or input_data.residualCents > input_data.amountCents:
        raise ApiError("invalid_input", "residualCents must be between 0 and amountCents")

    parse_date_ymd(input_data.startDate, "startDate")
    occurred_at = normalize_timestamp(input_data.occurredAt)

    tx_id = str(uuid.uuid4())
    schedule_id = str(uuid.uuid4())

    with get_connection() as conn:
        with transaction(conn):
            now = now_utc_rfc3339()
            conn.execute(
                """
                INSERT INTO transactions (
                    id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                    accrual_type, is_asset_purchase, note, occurred_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'Flow', 1, ?, ?, ?)
                """,
                (
                    tx_id,
                    input_data.amountCents,
                    input_data.fromAccountId,
                    input_data.assetAccountId,
                    input_data.payeeId,
                    input_data.categoryId,
                    input_data.note,
                    occurred_at,
                    now,
                ),
            )
            _apply_balance_delta(conn, input_data.fromAccountId, -input_data.amountCents)
            _apply_balance_delta(conn, input_data.assetAccountId, input_data.amountCents)

            conn.execute(
                """
                INSERT INTO amortization_schedules (
                    id, asset_account_id, strategy, total_periods, residual_cents, start_date,
                    source_transaction_id, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?)
                """,
                (
                    schedule_id,
                    input_data.assetAccountId,
                    input_data.strategy.value,
                    input_data.totalPeriods,
                    input_data.residualCents,
                    input_data.startDate,
                    tx_id,
                    now,
                ),
            )

        return AssetPurchaseResultDto(
            transaction=_load_transaction(conn, tx_id),
            schedule=_load_schedule(conn, schedule_id),
        )


def reconcile_account(input_data: ReconcileInput) -> ReconcileResultDto:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT balance_cents FROM accounts WHERE id = ?", (input_data.accountId,)
        ).fetchone()
        if row is None:
            raise ApiError("not_found", "account not found", status_code=404)

        system_balance = int(row["balance_cents"])
        delta = input_data.actualBalanceCents - system_balance
        adjustment_id: Optional[str] = None

        with transaction(conn):
            if delta != 0:
                adjustment_id = str(uuid.uuid4())
                from_account = input_data.accountId if delta < 0 else None
                to_account = input_data.accountId if delta > 0 else None
                conn.execute(
                    """
                    INSERT INTO transactions (
                        id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                        accrual_type, is_asset_purchase, note, occurred_at, created_at
                    ) VALUES (?, ?, ?, ?, NULL, NULL, 'Adjustment', 0, ?, ?, ?)
                    """,
                    (
                        adjustment_id,
                        abs(delta),
                        from_account,
                        to_account,
                        input_data.note or "Auto adjustment from reconciliation",
                        normalize_timestamp(input_data.occurredAt),
                        now_utc_rfc3339(),
                    ),
                )
                _apply_balance_delta(conn, input_data.accountId, delta)

            conn.execute(
                """
                INSERT INTO balance_snapshots (
                    id, account_id, actual_balance_cents, system_balance_cents,
                    delta_cents, captured_at, adjustment_tx_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    input_data.accountId,
                    input_data.actualBalanceCents,
                    system_balance,
                    delta,
                    now_utc_rfc3339(),
                    adjustment_id,
                ),
            )

        return ReconcileResultDto(
            account=_load_account(conn, input_data.accountId),
            deltaCents=delta,
            adjustmentTransaction=_load_transaction(conn, adjustment_id) if adjustment_id else None,
        )


def get_cash_flow_report(period_ym: str) -> ReportDto:
    parse_period(period_ym)

    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT COALESCE(c.name, 'Uncategorized') AS label, SUM(t.amount_cents) AS total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.accrual_type != 'Depreciation'
              AND substr(t.occurred_at, 1, 7) = ?
            GROUP BY label
            ORDER BY total DESC
            """,
            (period_ym,),
        ).fetchall()

        items = [ReportItemDto(label=row["label"], amountCents=int(row["total"])) for row in rows]
        total = sum(item.amountCents for item in items)
        return ReportDto(periodYm=period_ym, totalExpenseCents=total, items=items)


def get_utility_report(period_ym: str) -> ReportDto:
    parse_period(period_ym)

    with get_connection() as conn:
        with transaction(conn):
            ensure_depreciation_for_period(conn, period_ym)

        rows = conn.execute(
            """
            SELECT
              CASE WHEN t.accrual_type = 'Depreciation' THEN 'Depreciation' ELSE COALESCE(c.name, 'Uncategorized') END AS label,
              SUM(t.amount_cents) AS total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE substr(t.occurred_at, 1, 7) = ?
              AND ((t.accrual_type = 'Flow' AND t.is_asset_purchase = 0) OR t.accrual_type = 'Depreciation')
            GROUP BY label
            ORDER BY total DESC
            """,
            (period_ym,),
        ).fetchall()

        items = [ReportItemDto(label=row["label"], amountCents=int(row["total"])) for row in rows]
        total = sum(item.amountCents for item in items)
        return ReportDto(periodYm=period_ym, totalExpenseCents=total, items=items)


def list_adjustment_kpi(input_data: Optional[KpiPeriodInput]) -> AdjustmentKpiDto:
    where_clauses = []
    params: list[str] = []

    if input_data is not None:
        if input_data.fromPeriodYm is not None:
            parse_period(input_data.fromPeriodYm)
            where_clauses.append("substr(occurred_at, 1, 7) >= ?")
            params.append(input_data.fromPeriodYm)
        if input_data.toPeriodYm is not None:
            parse_period(input_data.toPeriodYm)
            where_clauses.append("substr(occurred_at, 1, 7) <= ?")
            params.append(input_data.toPeriodYm)

    suffix = ""
    if where_clauses:
        suffix = " AND " + " AND ".join(where_clauses)

    with get_connection() as conn:
        adjustment_total = conn.execute(
            f"SELECT COALESCE(SUM(ABS(amount_cents)), 0) FROM transactions WHERE accrual_type = 'Adjustment'{suffix}",
            params,
        ).fetchone()[0]
        expense_total = conn.execute(
            f"SELECT COALESCE(SUM(amount_cents), 0) FROM transactions WHERE accrual_type = 'Flow' AND is_asset_purchase = 0{suffix}",
            params,
        ).fetchone()[0]

    adjustment_total_cents = int(adjustment_total or 0)
    expense_total_cents = int(expense_total or 0)
    ratio = 0.0
    if expense_total_cents != 0:
        ratio = adjustment_total_cents / expense_total_cents

    return AdjustmentKpiDto(
        adjustmentTotalCents=adjustment_total_cents,
        expenseTotalCents=expense_total_cents,
        ratio=ratio,
    )
