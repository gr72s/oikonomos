mod commands;
mod db;
mod models;

use commands::{
    create_account, create_asset_purchase, create_transaction, get_cash_flow_report,
    get_utility_report, init_app, list_accounts, list_adjustment_kpi, list_transactions,
    reconcile_account,
};
use db::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::new().expect("failed to initialize ~/.oikonomos/data.db");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            init_app,
            list_accounts,
            create_account,
            create_transaction,
            list_transactions,
            create_asset_purchase,
            reconcile_account,
            get_cash_flow_report,
            get_utility_report,
            list_adjustment_kpi
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
