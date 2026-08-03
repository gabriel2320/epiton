use tauri::Manager;

#[tauri::command]
fn clear_legacy_session(app: tauri::AppHandle) -> Result<bool, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "legacy session directory unavailable".to_owned())?;
    let legacy_file = data_dir.join("epiton-session.json");
    match std::fs::remove_file(legacy_file) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err("legacy session cleanup failed".to_owned()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![clear_legacy_session])
        .setup(|app| {
            let _ = app.get_webview_window("main");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Epiton");
}
