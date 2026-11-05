use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

const CAPTURE_SCRIPT: &str = include_str!("capture.js");

// Las pruebas automáticas del front se reportan a la terminal de `tauri dev`.
#[tauri::command]
fn report(msg: &str) {
    println!("[report] {msg}");
}

// Carga la página embed en un WebView oculto y devuelve la primera URL de stream
// que la página pida (misma técnica que Ukiku). Async: crear ventanas desde un
// comando síncrono se bloquea en Windows.
#[tauri::command]
async fn resolve_webview(
    app: AppHandle,
    label: String,
    url: String,
    timeout_ms: u64,
    visible: bool,
) -> Result<String, String> {
    let found: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let sink = found.clone();
    let parsed: tauri::Url = url.parse().map_err(|e| format!("url inválida: {e}"))?;
    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .visible(visible)
        .inner_size(480.0, 320.0)
        .initialization_script_for_all_frames(CAPTURE_SCRIPT)
        .on_document_title_changed(move |_w, title| {
            if let Some(u) = title.strip_prefix("__CAPTURE__") {
                *sink.lock().unwrap() = Some(u.to_string());
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    let watcher = found.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_millis(timeout_ms) {
            if let Some(u) = watcher.lock().unwrap().clone() {
                return Some(u);
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        None
    })
    .await
    .map_err(|e| e.to_string())?;

    let _ = win.close();
    result.ok_or_else(|| "sin captura (timeout)".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![report, resolve_webview])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
