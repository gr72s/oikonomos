use std::fs;
use std::sync::Mutex;

use chrono::{DateTime, Datelike, NaiveDate, SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use tauri::State;
use uuid::Uuid;

use crate::models::{
    AccountDto, AccountType, AccrualType, AmortizationScheduleDto, AmortizationStrategy, AppError,
    AppResult, AssetPurpose, TransactionDto, months_between,
};

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub data_dir: String,
    pub db_path: String,
}

impl AppState {
    pub fn new() -> AppResult<Self> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| AppError::InvalidInput("无法定位用户主目录".to_string()))?;
        let data_dir = home_dir.join(".oikonomos");
        fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("data.db");
        let conn = Connection::open(&db_path)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrate(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            data_dir: data_dir.to_string_lossy().to_string(),
            db_path: db_path.to_string_lossy().to_string(),
        })
    }
}

pub fn with_conn<T>(
    state: &State<'_, AppState>,
    func: impl FnOnce(&mut Connection) -> AppResult<T>,
) -> AppResult<T> {
    let mut guard = state
        .conn
        .lock()
        .map_err(|e| AppError::Lock(format!("数据库连接锁失败: {e}")))?;
    func(&mut guard)
}

pub fn now_utc_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

pub fn normalize_timestamp(value: Option<String>) -> AppResult<String> {
    match value {
        Some(raw) => {
            let dt = DateTime::parse_from_rfc3339(&raw).map_err(|_| {
                AppError::InvalidInput(
                    "时间格式必须是 RFC3339，例如 2026-02-22T12:00:00Z".to_string(),
                )
            })?;
            Ok(dt
                .with_timezone(&Utc)
                .to_rfc3339_opts(SecondsFormat::Secs, true))
        }
        None => Ok(now_utc_rfc3339()),
    }
}

pub fn parse_period(period_ym: &str) -> AppResult<(NaiveDate, String, String)> {
    let mut parts = period_ym.split('-');
    let year = parts
        .next()
        .and_then(|v| v.parse::<i32>().ok())
        .ok_or_else(|| AppError::InvalidInput(format!("无效 periodYm: {period_ym}")))?;
    let month = parts
        .next()
        .and_then(|v| v.parse::<u32>().ok())
        .ok_or_else(|| AppError::InvalidInput(format!("无效 periodYm: {period_ym}")))?;
    if parts.next().is_some() {
        return Err(AppError::InvalidInput(format!("无效 periodYm: {period_ym}")));
    }

    let start = NaiveDate::from_ymd_opt(year, month, 1)
        .ok_or_else(|| AppError::InvalidInput(format!("无效 periodYm: {period_ym}")))?;
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let next = NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .ok_or_else(|| AppError::InvalidInput(format!("无效 periodYm: {period_ym}")))?;

    Ok((
        start,
        format!("{}T00:00:00Z", start.format("%Y-%m-%d")),
        format!("{}T00:00:00Z", next.format("%Y-%m-%d")),
    ))
}

pub fn parse_date_ymd(value: &str, field_name: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::InvalidInput(format!("{field_name} 必须是 YYYY-MM-DD")))
}

pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('Asset', 'Liability')),
            purpose TEXT NOT NULL CHECK(purpose IN ('Investment', 'Productivity', 'LifeSupport', 'Spiritual')),
            balance_cents INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK(type != 'Liability' OR balance_cents <= 0)
        );
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            parent_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL,
            is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS payees (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            default_category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
            from_account_id TEXT NULL REFERENCES accounts(id) ON DELETE SET NULL,
            to_account_id TEXT NULL REFERENCES accounts(id) ON DELETE SET NULL,
            payee_id TEXT NULL REFERENCES payees(id) ON DELETE SET NULL,
            category_id TEXT NULL REFERENCES categories(id) ON DELETE SET NULL,
            accrual_type TEXT NOT NULL CHECK(accrual_type IN ('Flow', 'Depreciation', 'Adjustment')),
            is_asset_purchase INTEGER NOT NULL DEFAULT 0,
            note TEXT NULL,
            occurred_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transaction_tags (
            transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (transaction_id, tag_id)
        );
        CREATE TABLE IF NOT EXISTS amortization_schedules (
            id TEXT PRIMARY KEY,
            asset_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            strategy TEXT NOT NULL CHECK(strategy IN ('Linear', 'Accelerated')),
            total_periods INTEGER NOT NULL CHECK(total_periods > 0),
            residual_cents INTEGER NOT NULL CHECK(residual_cents >= 0),
            start_date TEXT NOT NULL,
            source_transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Completed', 'Cancelled')),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS amortization_postings (
            id TEXT PRIMARY KEY,
            schedule_id TEXT NOT NULL REFERENCES amortization_schedules(id) ON DELETE CASCADE,
            period_ym TEXT NOT NULL,
            amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
            transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
            generated_at TEXT NOT NULL,
            UNIQUE(schedule_id, period_ym)
        );
        CREATE TABLE IF NOT EXISTS balance_snapshots (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            actual_balance_cents INTEGER NOT NULL,
            system_balance_cents INTEGER NOT NULL,
            delta_cents INTEGER NOT NULL,
            captured_at TEXT NOT NULL,
            adjustment_tx_id TEXT NULL REFERENCES transactions(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at ON transactions(occurred_at);
        CREATE INDEX IF NOT EXISTS idx_transactions_accrual_type_occurred_at ON transactions(accrual_type, occurred_at);
        CREATE INDEX IF NOT EXISTS idx_amortization_postings_schedule_period ON amortization_postings(schedule_id, period_ym);
        CREATE INDEX IF NOT EXISTS idx_balance_snapshots_account_captured ON balance_snapshots(account_id, captured_at DESC);
        "#,
    )?;
    Ok(())
}

pub fn load_account_by_id(conn: &Connection, id: &str) -> AppResult<AccountDto> {
    let row = conn
        .query_row(
            "SELECT id, name, type, purpose, balance_cents, created_at, updated_at FROM accounts WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("账户不存在: {id}")))?;

    Ok(AccountDto {
        id: row.0,
        name: row.1,
        account_type: AccountType::from_db(&row.2)?,
        purpose: AssetPurpose::from_db(&row.3)?,
        balance_cents: row.4,
        created_at: row.5,
        updated_at: row.6,
    })
}

pub fn load_transaction_by_id(conn: &Connection, id: &str) -> AppResult<TransactionDto> {
    let row = conn
        .query_row(
            r#"
            SELECT id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                   accrual_type, is_asset_purchase, note, occurred_at, created_at
            FROM transactions
            WHERE id = ?1
            "#,
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("交易不存在: {id}")))?;

    Ok(TransactionDto {
        id: row.0,
        amount_cents: row.1,
        from_account_id: row.2,
        to_account_id: row.3,
        payee_id: row.4,
        category_id: row.5,
        accrual_type: AccrualType::from_db(&row.6)?,
        is_asset_purchase: row.7 != 0,
        note: row.8,
        occurred_at: row.9,
        created_at: row.10,
    })
}

pub fn load_schedule_by_id(conn: &Connection, id: &str) -> AppResult<AmortizationScheduleDto> {
    let row = conn
        .query_row(
            r#"
            SELECT id, asset_account_id, strategy, total_periods, residual_cents,
                   start_date, source_transaction_id, status
            FROM amortization_schedules
            WHERE id = ?1
            "#,
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("摊销计划不存在: {id}")))?;

    Ok(AmortizationScheduleDto {
        id: row.0,
        asset_account_id: row.1,
        strategy: AmortizationStrategy::from_db(&row.2)?,
        total_periods: row.3,
        residual_cents: row.4,
        start_date: row.5,
        source_transaction_id: row.6,
        status: row.7,
    })
}

pub fn apply_balance_delta(tx: &Transaction<'_>, account_id: &str, delta: i64) -> AppResult<()> {
    let updated = tx.execute(
        "UPDATE accounts SET balance_cents = balance_cents + ?1, updated_at = ?2 WHERE id = ?3",
        params![delta, now_utc_rfc3339(), account_id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("账户不存在: {account_id}")));
    }

    let (account_type, balance): (String, i64) = tx.query_row(
        "SELECT type, balance_cents FROM accounts WHERE id = ?1",
        params![account_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    if account_type == "Liability" && balance > 0 {
        return Err(AppError::InvalidInput(format!(
            "负债账户余额不能为正: {account_id}"
        )));
    }
    Ok(())
}

fn calculate_depreciation_amount(
    strategy: &AmortizationStrategy,
    depreciable_cents: i64,
    total_periods: i64,
    period_index: i64,
) -> i64 {
    if depreciable_cents <= 0 || total_periods <= 0 || period_index < 0 || period_index >= total_periods {
        return 0;
    }

    match strategy {
        AmortizationStrategy::Linear => {
            let base = depreciable_cents / total_periods;
            if period_index == total_periods - 1 {
                base + depreciable_cents % total_periods
            } else {
                base
            }
        }
        AmortizationStrategy::Accelerated => {
            let weight_sum = total_periods * (total_periods + 1) / 2;
            if period_index == total_periods - 1 {
                let mut allocated = 0_i64;
                for i in 0..period_index {
                    let weight = total_periods - i;
                    allocated += depreciable_cents * weight / weight_sum;
                }
                depreciable_cents - allocated
            } else {
                let weight = total_periods - period_index;
                depreciable_cents * weight / weight_sum
            }
        }
    }
}

pub fn ensure_depreciation_for_period(conn: &mut Connection, period_ym: &str) -> AppResult<()> {
    let (period_start, period_start_ts, _) = parse_period(period_ym)?;
    let tx = conn.transaction()?;
    let schedules: Vec<(String, String, i64, i64, String, i64)> = {
        let mut stmt = tx.prepare(
            r#"
            SELECT s.id, s.strategy, s.total_periods, s.residual_cents, s.start_date, t.amount_cents
            FROM amortization_schedules s
            JOIN transactions t ON t.id = s.source_transaction_id
            WHERE s.status = 'Active'
            "#,
        )?;
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ));
        }
        out
    };

    for (schedule_id, strategy_text, total_periods, residual_cents, start_date, purchase_amount) in schedules {
        let strategy = AmortizationStrategy::from_db(&strategy_text)?;
        let start = parse_date_ymd(&start_date, "startDate")?;
        let start_month = NaiveDate::from_ymd_opt(start.year(), start.month(), 1)
            .ok_or_else(|| AppError::InvalidInput("startDate 无效".to_string()))?;
        let period_index = months_between(start_month, period_start);
        if period_index < 0 || period_index >= total_periods {
            continue;
        }

        let existing: Option<String> = tx
            .query_row(
                "SELECT id FROM amortization_postings WHERE schedule_id = ?1 AND period_ym = ?2",
                params![schedule_id, period_ym],
                |row| row.get(0),
            )
            .optional()?;
        if existing.is_some() {
            continue;
        }

        let amount = calculate_depreciation_amount(
            &strategy,
            purchase_amount - residual_cents,
            total_periods,
            period_index,
        );
        if amount <= 0 {
            continue;
        }

        let depreciation_tx_id = Uuid::new_v4().to_string();
        tx.execute(
            r#"
            INSERT INTO transactions (
                id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                accrual_type, is_asset_purchase, note, occurred_at, created_at
            ) VALUES (?1, ?2, NULL, NULL, NULL, NULL, 'Depreciation', 0, ?3, ?4, ?5)
            "#,
            params![
                depreciation_tx_id,
                amount,
                Some(format!("Depreciation for {period_ym}")),
                period_start_ts,
                now_utc_rfc3339()
            ],
        )?;
        tx.execute(
            "INSERT INTO amortization_postings (id, schedule_id, period_ym, amount_cents, transaction_id, generated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::new_v4().to_string(),
                schedule_id,
                period_ym,
                amount,
                depreciation_tx_id,
                now_utc_rfc3339()
            ],
        )?;

        if period_index == total_periods - 1 {
            tx.execute(
                "UPDATE amortization_schedules SET status = 'Completed' WHERE id = ?1",
                params![schedule_id],
            )?;
        }
    }

    tx.commit()?;
    Ok(())
}
