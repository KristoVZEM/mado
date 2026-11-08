mod resolver;
mod datos;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

const CAPTURE_SCRIPT: &str = include_str!("capture.js");
const MAX_TIMEOUT_MS: u64 = 60_000;
static WINDOW_SEQ: AtomicU64 = AtomicU64::new(0);

// Carga la página embed en un WebView oculto y devuelve la primera URL de stream
// que la página pida (misma técnica que Ukiku). Async: crear ventanas desde un
// comando síncrono se bloquea en Windows.
//
// Seguridad: el frontend solo elige el servidor por nombre; los hosts permitidos viven
// en `resolver.rs`. La ventana no admite navegar fuera del dominio ni abrir ventanas
// nuevas (la publicidad), no comparte sesión (incognito) y la URL capturada solo se
// acepta si pasa `validate_stream`.
#[tauri::command]
async fn resolve_webview(
    app: AppHandle,
    server: String,
    url: String,
    timeout_ms: u64,
    visible: bool,
) -> Result<String, String> {
    let rule = resolver::rule(&server).ok_or_else(|| format!("servidor no soportado: {server}"))?;
    let page: tauri::Url = url.parse().map_err(|e| format!("url inválida: {e}"))?;
    if !resolver::page_allowed(rule, &page) {
        return Err(format!("la página no pertenece a {}", rule.page_domain));
    }
    let timeout_ms = timeout_ms.min(MAX_TIMEOUT_MS);

    let found: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let sink = found.clone();
    let label = format!("wv-{}-{}", rule.name, WINDOW_SEQ.fetch_add(1, Ordering::Relaxed));

    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(page))
        .visible(visible)
        .inner_size(480.0, 320.0)
        .incognito(true)
        .initialization_script_for_all_frames(CAPTURE_SCRIPT)
        .on_navigation(move |u| resolver::page_allowed(rule, u))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_document_title_changed(move |_w, title| {
            if let Some(raw) = title.strip_prefix("__CAPTURE__") {
                match resolver::validate_stream(rule, raw) {
                    Ok(u) => *sink.lock().unwrap() = Some(u.to_string()),
                    Err(e) => eprintln!("[resolver] URL descartada: {e}"),
                }
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
    result.ok_or_else(|| "sin captura válida (timeout)".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![resolve_webview])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación de Tauri");
}
