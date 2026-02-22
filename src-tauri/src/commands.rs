use rusqlite::{params, params_from_iter, OptionalExtension};
use tauri::State;
use uuid::Uuid;

use crate::db::{
    apply_balance_delta, ensure_depreciation_for_period, load_account_by_id, load_schedule_by_id,
    load_transaction_by_id, normalize_timestamp, now_utc_rfc3339, parse_date_ymd, parse_period,
    with_conn, AppState,
};
use crate::models::{
    AccountDto, AccountType, AccrualType, AdjustmentKpiDto, AppError, AssetPurchaseResultDto,
    CommandResult, CreateAccountInput, CreateAssetPurchaseInput, CreateTransactionInput,
    InitStateDto, KpiPeriodInput, PagedTransactionsDto, ReconcileInput, ReconcileResultDto,
    ReportDto, ReportItemDto, ReportPeriodInput, TransactionDto, TransactionFilter,
};

#[tauri::command]
pub fn init_app(state: State<'_, AppState>) -> CommandResult<InitStateDto> {
    Ok(InitStateDto {
        data_dir: state.data_dir.clone(),
        database_path: state.db_path.clone(),
    })
}

#[tauri::command]
pub fn list_accounts(state: State<'_, AppState>) -> CommandResult<Vec<AccountDto>> {
    with_conn(&state, |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, type, purpose, balance_cents, created_at, updated_at FROM accounts ORDER BY name ASC",
        )?;
        let mut rows = stmt.query([])?;
        let mut accounts = Vec::new();
        while let Some(row) = rows.next()? {
            let account_type = AccountType::from_db(&row.get::<_, String>(2)?)?;
            let purpose = crate::models::AssetPurpose::from_db(&row.get::<_, String>(3)?)?;
            accounts.push(AccountDto {
                id: row.get(0)?,
                name: row.get(1)?,
                account_type,
                purpose,
                balance_cents: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            });
        }
        Ok(accounts)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_account(
    state: State<'_, AppState>,
    input: CreateAccountInput,
) -> CommandResult<AccountDto> {
    with_conn(&state, |conn| {
        if input.name.trim().is_empty() {
            return Err(AppError::InvalidInput("账户名不能为空".to_string()));
        }
        if matches!(input.account_type, AccountType::Liability) && input.initial_balance_cents > 0 {
            return Err(AppError::InvalidInput(
                "负债账户初始余额必须小于或等于 0".to_string(),
            ));
        }

        let id = Uuid::new_v4().to_string();
        let now = now_utc_rfc3339();
        conn.execute(
            "INSERT INTO accounts (id, name, type, purpose, balance_cents, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![id, input.name.trim(), input.account_type.as_str(), input.purpose.as_str(), input.initial_balance_cents, now],
        )?;
        load_account_by_id(conn, &id)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_transaction(
    state: State<'_, AppState>,
    input: CreateTransactionInput,
) -> CommandResult<TransactionDto> {
    with_conn(&state, |conn| {
        if input.amount_cents <= 0 {
            return Err(AppError::InvalidInput("交易金额必须大于 0".to_string()));
        }
        let accrual_type = input.accrual_type.unwrap_or(AccrualType::Flow);
        if !matches!(accrual_type, AccrualType::Depreciation)
            && input.from_account_id.is_none()
            && input.to_account_id.is_none()
        {
            return Err(AppError::InvalidInput(
                "非折旧交易至少需要一个账户(from/to)".to_string(),
            ));
        }
        let tx_id = Uuid::new_v4().to_string();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO transactions (id, amount_cents, from_account_id, to_account_id, payee_id, category_id, accrual_type, is_asset_purchase, note, occurred_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                tx_id,
                input.amount_cents,
                input.from_account_id,
                input.to_account_id,
                input.payee_id,
                input.category_id,
                accrual_type.as_str(),
                if input.is_asset_purchase.unwrap_or(false) { 1 } else { 0 },
                input.note,
                normalize_timestamp(input.occurred_at)?,
                now_utc_rfc3339()
            ],
        )?;

        if !matches!(accrual_type, AccrualType::Depreciation) {
            if let Some(from_id) = &input.from_account_id {
                apply_balance_delta(&tx, from_id, -input.amount_cents)?;
            }
            if let Some(to_id) = &input.to_account_id {
                apply_balance_delta(&tx, to_id, input.amount_cents)?;
            }
        }
        tx.commit()?;
        load_transaction_by_id(conn, &tx_id)
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_transactions(
    state: State<'_, AppState>,
    filter: Option<TransactionFilter>,
) -> CommandResult<PagedTransactionsDto> {
    with_conn(&state, |conn| {
        let period = filter.as_ref().and_then(|f| f.period_ym.clone());
        if let Some(ref p) = period {
            parse_period(p)?;
        }
        let accrual = filter.and_then(|f| f.accrual_type);
        let accrual_text = accrual.as_ref().map(AccrualType::as_str);

        let mut stmt = conn.prepare(
            r#"
            SELECT id, amount_cents, from_account_id, to_account_id, payee_id, category_id,
                   accrual_type, is_asset_purchase, note, occurred_at, created_at
            FROM transactions
            WHERE (?1 IS NULL OR substr(occurred_at, 1, 7) = ?1)
              AND (?2 IS NULL OR accrual_type = ?2)
            ORDER BY occurred_at DESC, created_at DESC
            "#,
        )?;
        let mut rows = stmt.query(params![period, accrual_text])?;
        let mut items = Vec::new();
        while let Some(row) = rows.next()? {
            items.push(TransactionDto {
                id: row.get(0)?,
                amount_cents: row.get(1)?,
                from_account_id: row.get(2)?,
                to_account_id: row.get(3)?,
                payee_id: row.get(4)?,
                category_id: row.get(5)?,
                accrual_type: AccrualType::from_db(&row.get::<_, String>(6)?)?,
                is_asset_purchase: row.get::<_, i64>(7)? != 0,
                note: row.get(8)?,
                occurred_at: row.get(9)?,
                created_at: row.get(10)?,
            });
        }
        Ok(PagedTransactionsDto {
            total: items.len(),
            items,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_asset_purchase(
    state: State<'_, AppState>,
    input: CreateAssetPurchaseInput,
) -> CommandResult<AssetPurchaseResultDto> {
    with_conn(&state, |conn| {
        if input.amount_cents <= 0 {
            return Err(AppError::InvalidInput("交易金额必须大于 0".to_string()));
        }
        if input.total_periods <= 0 {
            return Err(AppError::InvalidInput("totalPeriods 必须大于 0".to_string()));
        }
        if input.residual_cents < 0 || input.residual_cents > input.amount_cents {
            return Err(AppError::InvalidInput(
                "residualCents 必须在 0 到 amountCents 之间".to_string(),
            ));
        }
        parse_date_ymd(&input.start_date, "startDate")?;

        let transaction_id = Uuid::new_v4().to_string();
        let schedule_id = Uuid::new_v4().to_string();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO transactions (id, amount_cents, from_account_id, to_account_id, payee_id, category_id, accrual_type, is_asset_purchase, note, occurred_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'Flow', 1, ?7, ?8, ?9)",
            params![
                transaction_id,
                input.amount_cents,
                input.from_account_id,
                input.asset_account_id,
                input.payee_id,
                input.category_id,
                input.note,
                normalize_timestamp(input.occurred_at)?,
                now_utc_rfc3339()
            ],
        )?;
        apply_balance_delta(&tx, &input.from_account_id, -input.amount_cents)?;
        apply_balance_delta(&tx, &input.asset_account_id, input.amount_cents)?;
        tx.execute(
            "INSERT INTO amortization_schedules (id, asset_account_id, strategy, total_periods, residual_cents, start_date, source_transaction_id, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Active', ?8)",
            params![
                schedule_id,
                input.asset_account_id,
                input.strategy.as_str(),
                input.total_periods,
                input.residual_cents,
                input.start_date,
                transaction_id,
                now_utc_rfc3339()
            ],
        )?;
        tx.commit()?;

        Ok(AssetPurchaseResultDto {
            transaction: load_transaction_by_id(conn, &transaction_id)?,
            schedule: load_schedule_by_id(conn, &schedule_id)?,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reconcile_account(
    state: State<'_, AppState>,
    input: ReconcileInput,
) -> CommandResult<ReconcileResultDto> {
    with_conn(&state, |conn| {
        let system_balance: i64 = conn
            .query_row(
                "SELECT balance_cents FROM accounts WHERE id = ?1",
                params![input.account_id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound("账户不存在".to_string()))?;
        let delta = input.actual_balance_cents - system_balance;
        let mut adjustment_id: Option<String> = None;
        let tx = conn.transaction()?;

        if delta != 0 {
            let id = Uuid::new_v4().to_string();
            let from_account = if delta < 0 {
                Some(input.account_id.clone())
            } else {
                None
            };
            let to_account = if delta > 0 {
                Some(input.account_id.clone())
            } else {
                None
            };
            tx.execute(
                "INSERT INTO transactions (id, amount_cents, from_account_id, to_account_id, payee_id, category_id, accrual_type, is_asset_purchase, note, occurred_at, created_at) VALUES (?1, ?2, ?3, ?4, NULL, NULL, 'Adjustment', 0, ?5, ?6, ?7)",
                params![
                    id,
                    delta.abs(),
                    from_account,
                    to_account,
                    input
                        .note
                        .clone()
                        .unwrap_or_else(|| "Auto adjustment from reconciliation".to_string()),
                    normalize_timestamp(input.occurred_at.clone())?,
                    now_utc_rfc3339()
                ],
            )?;
            apply_balance_delta(&tx, &input.account_id, delta)?;
            adjustment_id = Some(id);
        }

        tx.execute(
            "INSERT INTO balance_snapshots (id, account_id, actual_balance_cents, system_balance_cents, delta_cents, captured_at, adjustment_tx_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                Uuid::new_v4().to_string(),
                input.account_id,
                input.actual_balance_cents,
                system_balance,
                delta,
                now_utc_rfc3339(),
                adjustment_id
            ],
        )?;
        tx.commit()?;

        Ok(ReconcileResultDto {
            account: load_account_by_id(conn, &input.account_id)?,
            delta_cents: delta,
            adjustment_transaction: if let Some(id) = adjustment_id {
                Some(load_transaction_by_id(conn, &id)?)
            } else {
                None
            },
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cash_flow_report(
    state: State<'_, AppState>,
    input: ReportPeriodInput,
) -> CommandResult<ReportDto> {
    with_conn(&state, |conn| {
        parse_period(&input.period_ym)?;
        let mut stmt = conn.prepare(
            r#"
            SELECT COALESCE(c.name, 'Uncategorized') AS label, SUM(t.amount_cents) AS total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.accrual_type != 'Depreciation'
              AND substr(t.occurred_at, 1, 7) = ?1
            GROUP BY label
            ORDER BY total DESC
            "#,
        )?;
        let mut rows = stmt.query(params![input.period_ym])?;
        let mut items = Vec::new();
        while let Some(row) = rows.next()? {
            items.push(ReportItemDto {
                label: row.get(0)?,
                amount_cents: row.get(1)?,
            });
        }
        Ok(ReportDto {
            period_ym: input.period_ym,
            total_expense_cents: items.iter().map(|v| v.amount_cents).sum(),
            items,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_utility_report(
    state: State<'_, AppState>,
    input: ReportPeriodInput,
) -> CommandResult<ReportDto> {
    with_conn(&state, |conn| {
        parse_period(&input.period_ym)?;
        ensure_depreciation_for_period(conn, &input.period_ym)?;
        let mut stmt = conn.prepare(
            r#"
            SELECT
              CASE WHEN t.accrual_type = 'Depreciation' THEN 'Depreciation' ELSE COALESCE(c.name, 'Uncategorized') END AS label,
              SUM(t.amount_cents) AS total
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE substr(t.occurred_at, 1, 7) = ?1
              AND ((t.accrual_type = 'Flow' AND t.is_asset_purchase = 0) OR t.accrual_type = 'Depreciation')
            GROUP BY label
            ORDER BY total DESC
            "#,
        )?;
        let mut rows = stmt.query(params![input.period_ym])?;
        let mut items = Vec::new();
        while let Some(row) = rows.next()? {
            items.push(ReportItemDto {
                label: row.get(0)?,
                amount_cents: row.get(1)?,
            });
        }
        Ok(ReportDto {
            period_ym: input.period_ym,
            total_expense_cents: items.iter().map(|v| v.amount_cents).sum(),
            items,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_adjustment_kpi(
    state: State<'_, AppState>,
    input: Option<KpiPeriodInput>,
) -> CommandResult<AdjustmentKpiDto> {
    with_conn(&state, |conn| {
        let mut where_clauses = Vec::new();
        let mut params_vec: Vec<String> = Vec::new();
        if let Some(range) = input {
            if let Some(from) = range.from_period_ym {
                parse_period(&from)?;
                where_clauses.push("substr(occurred_at, 1, 7) >= ?".to_string());
                params_vec.push(from);
            }
            if let Some(to) = range.to_period_ym {
                parse_period(&to)?;
                where_clauses.push("substr(occurred_at, 1, 7) <= ?".to_string());
                params_vec.push(to);
            }
        }
        let suffix = if where_clauses.is_empty() {
            "".to_string()
        } else {
            format!(" AND {}", where_clauses.join(" AND "))
        };
        let adjustment_total_cents: i64 = conn.query_row(
            &format!(
                "SELECT COALESCE(SUM(ABS(amount_cents)), 0) FROM transactions WHERE accrual_type = 'Adjustment'{}",
                suffix
            ),
            params_from_iter(params_vec.iter()),
            |row| row.get(0),
        )?;
        let expense_total_cents: i64 = conn.query_row(
            &format!(
                "SELECT COALESCE(SUM(amount_cents), 0) FROM transactions WHERE accrual_type = 'Flow' AND is_asset_purchase = 0{}",
                suffix
            ),
            params_from_iter(params_vec.iter()),
            |row| row.get(0),
        )?;
        Ok(AdjustmentKpiDto {
            adjustment_total_cents,
            expense_total_cents,
            ratio: if expense_total_cents == 0 {
                0.0
            } else {
                adjustment_total_cents as f64 / expense_total_cents as f64
            },
        })
    })
    .map_err(|e| e.to_string())
}
