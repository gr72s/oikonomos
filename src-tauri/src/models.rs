use chrono::{Datelike, NaiveDate};
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type CommandResult<T> = Result<T, String>;
pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("数据库错误: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("I/O 错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("数据锁错误: {0}")]
    Lock(String),
    #[error("无效输入: {0}")]
    InvalidInput(String),
    #[error("未找到: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum AccountType {
    Asset,
    Liability,
}

impl AccountType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Asset => "Asset",
            Self::Liability => "Liability",
        }
    }

    pub fn from_db(value: &str) -> AppResult<Self> {
        match value {
            "Asset" => Ok(Self::Asset),
            "Liability" => Ok(Self::Liability),
            _ => Err(AppError::InvalidInput(format!("未知账户类型: {value}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum AssetPurpose {
    Investment,
    Productivity,
    LifeSupport,
    Spiritual,
}

impl AssetPurpose {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Investment => "Investment",
            Self::Productivity => "Productivity",
            Self::LifeSupport => "LifeSupport",
            Self::Spiritual => "Spiritual",
        }
    }

    pub fn from_db(value: &str) -> AppResult<Self> {
        match value {
            "Investment" => Ok(Self::Investment),
            "Productivity" => Ok(Self::Productivity),
            "LifeSupport" => Ok(Self::LifeSupport),
            "Spiritual" => Ok(Self::Spiritual),
            _ => Err(AppError::InvalidInput(format!("未知资产用途: {value}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum AccrualType {
    Flow,
    Depreciation,
    Adjustment,
}

impl AccrualType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Flow => "Flow",
            Self::Depreciation => "Depreciation",
            Self::Adjustment => "Adjustment",
        }
    }

    pub fn from_db(value: &str) -> AppResult<Self> {
        match value {
            "Flow" => Ok(Self::Flow),
            "Depreciation" => Ok(Self::Depreciation),
            "Adjustment" => Ok(Self::Adjustment),
            _ => Err(AppError::InvalidInput(format!("未知权责类型: {value}"))),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum AmortizationStrategy {
    Linear,
    Accelerated,
}

impl AmortizationStrategy {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Linear => "Linear",
            Self::Accelerated => "Accelerated",
        }
    }

    pub fn from_db(value: &str) -> AppResult<Self> {
        match value {
            "Linear" => Ok(Self::Linear),
            "Accelerated" => Ok(Self::Accelerated),
            _ => Err(AppError::InvalidInput(format!("未知摊销策略: {value}"))),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InitStateDto {
    pub data_dir: String,
    pub database_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountDto {
    pub id: String,
    pub name: String,
    pub account_type: AccountType,
    pub purpose: AssetPurpose,
    pub balance_cents: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAccountInput {
    pub name: String,
    pub account_type: AccountType,
    pub purpose: AssetPurpose,
    pub initial_balance_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionDto {
    pub id: String,
    pub amount_cents: i64,
    pub from_account_id: Option<String>,
    pub to_account_id: Option<String>,
    pub payee_id: Option<String>,
    pub category_id: Option<String>,
    pub accrual_type: AccrualType,
    pub is_asset_purchase: bool,
    pub note: Option<String>,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTransactionInput {
    pub amount_cents: i64,
    pub from_account_id: Option<String>,
    pub to_account_id: Option<String>,
    pub payee_id: Option<String>,
    pub category_id: Option<String>,
    pub accrual_type: Option<AccrualType>,
    pub is_asset_purchase: Option<bool>,
    pub note: Option<String>,
    pub occurred_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionFilter {
    pub period_ym: Option<String>,
    pub accrual_type: Option<AccrualType>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PagedTransactionsDto {
    pub items: Vec<TransactionDto>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AmortizationScheduleDto {
    pub id: String,
    pub asset_account_id: String,
    pub strategy: AmortizationStrategy,
    pub total_periods: i64,
    pub residual_cents: i64,
    pub start_date: String,
    pub source_transaction_id: String,
    pub status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssetPurchaseInput {
    pub from_account_id: String,
    pub asset_account_id: String,
    pub amount_cents: i64,
    pub category_id: Option<String>,
    pub payee_id: Option<String>,
    pub note: Option<String>,
    pub occurred_at: Option<String>,
    pub strategy: AmortizationStrategy,
    pub total_periods: i64,
    pub residual_cents: i64,
    pub start_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetPurchaseResultDto {
    pub transaction: TransactionDto,
    pub schedule: AmortizationScheduleDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileInput {
    pub account_id: String,
    pub actual_balance_cents: i64,
    pub occurred_at: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileResultDto {
    pub account: AccountDto,
    pub delta_cents: i64,
    pub adjustment_transaction: Option<TransactionDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportPeriodInput {
    pub period_ym: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportItemDto {
    pub label: String,
    pub amount_cents: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportDto {
    pub period_ym: String,
    pub total_expense_cents: i64,
    pub items: Vec<ReportItemDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KpiPeriodInput {
    pub from_period_ym: Option<String>,
    pub to_period_ym: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdjustmentKpiDto {
    pub adjustment_total_cents: i64,
    pub expense_total_cents: i64,
    pub ratio: f64,
}

pub fn months_between(start_month: NaiveDate, target_month: NaiveDate) -> i64 {
    let years = target_month.year() - start_month.year();
    let months = target_month.month() as i32 - start_month.month() as i32;
    (years * 12 + months) as i64
}
