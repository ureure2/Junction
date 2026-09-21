pub mod launch;
pub mod model;
pub mod storage;

use std::sync::Mutex;
use tauri::Manager;
struct AppState {
    store: Mutex<storage::Store>,
    launcher: Mutex<launch::Launcher>,
}
fn locked<T>(mutex: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "내부 상태에 접근할 수 없습니다. 앱을 다시 열어 주세요.".into())
}
#[tauri::command]
fn load_workspace(state: tauri::State<AppState>) -> Result<storage::Loaded, String> {
    locked(&state.store)?.load()
}
#[tauri::command]
fn save_workspace(
    workspace: model::Workspace,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    locked(&state.store)?.save(&workspace)
}
#[tauri::command]
fn read_import(path: String) -> Result<model::Workspace, String> {
    storage::read(std::path::Path::new(&path))
}
#[tauri::command]
fn export_workspace(path: String, workspace: model::Workspace) -> Result<(), String> {
    workspace.validate()?;
    storage::atomic_write(
        std::path::Path::new(&path),
        &serde_json::to_vec_pretty(&workspace).map_err(storage::err)?,
    )
}
#[tauri::command]
fn launch_item(
    item: model::Item,
    folder: String,
    state: tauri::State<AppState>,
) -> Result<Option<launch::Run>, String> {
    if item.kind == model::Kind::Command {
        let dir = locked(&state.store)?.dir.join("runs");
        Ok(Some(
            locked(&state.launcher)?.start(&item, &folder, &dir, true)?,
        ))
    } else {
        launch::open_item(&item, &folder)?;
        Ok(None)
    }
}
#[tauri::command]
fn list_runs(state: tauri::State<AppState>) -> Result<Vec<launch::Run>, String> {
    locked(&state.launcher)?.list()
}
#[tauri::command]
fn stop_run(id: String, state: tauri::State<AppState>) -> Result<(), String> {
    locked(&state.launcher)?.stop(&id)
}
#[tauri::command]
fn environment(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
    Ok(
        serde_json::json!({ "shell": launch::shell_path()?.file_stem().unwrap_or_default().to_string_lossy(), "dataDir": locked(&state.store)?.dir.to_string_lossy() }),
    )
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    locked(&state.launcher)?.shutdown();
    app.exit(0);
    Ok(())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            // Debug-only isolation for native UI tests; release always uses the real app data path.
            #[cfg(debug_assertions)]
            let dir = std::env::var_os("JUNCTION_TEST_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(dir);
            app.manage(AppState {
                store: Mutex::new(storage::Store { dir }),
                launcher: Mutex::new(launch::Launcher::default()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_workspace,
            save_workspace,
            read_import,
            export_workspace,
            launch_item,
            list_runs,
            stop_run,
            environment,
            quit_app
        ])
        .build(tauri::generate_context!())
        .expect("Junction을 시작할 수 없습니다.")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut launcher) = app.state::<AppState>().launcher.lock() {
                    launcher.shutdown();
                }
            }
        });
}
