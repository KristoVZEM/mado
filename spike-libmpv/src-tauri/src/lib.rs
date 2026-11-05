// Las pruebas automáticas del front se reportan a la terminal de `tauri dev`.
#[tauri::command]
fn report(msg: &str) {
    println!("[report] {msg}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![report])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
