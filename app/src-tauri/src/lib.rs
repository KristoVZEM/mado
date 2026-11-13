mod bandeja;
mod resolver;
mod datos;
mod token;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::StateFlags;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

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
                    Err(e) => log::warn!("[resolver] URL descartada: {e}"),
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

/// Abre en el Explorador la carpeta donde se escriben los registros (la crea si aún no existe).
#[tauri::command]
fn abrir_registros(app: AppHandle) -> Result<(), String> {
    let carpeta = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&carpeta).map_err(|e| format!("no se pudo crear la carpeta de registros: {}", e.kind()))?;
    std::process::Command::new("explorer")
        .arg(&carpeta)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("no se pudo abrir la carpeta de registros: {}", e.kind()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Una sola instancia (debe registrarse el primero): abrir la app otra vez trae al frente la que ya
        // está. Dos a la vez duplicarían la sincronización y los avisos, y escribirían la misma base.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| bandeja::mostrar_principal(app)))
        // Inicio con Windows (lo activa el usuario en Ajustes): arranca escondida en la bandeja.
        .plugin(tauri_plugin_autostart::Builder::new().arg(bandeja::ARG_OCULTA).build())
        // Recuerda tamaño, posición y maximizado de la ventana principal. La pantalla completa no se guarda
        // (es del Reproductor) y las ventanas ocultas del resolutor quedan fuera.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_filter(|etiqueta| etiqueta == "main")
                .build(),
        )
        // Registro a archivo: la app instalada no tiene consola, así que sin esto el detalle de cualquier
        // fallo se pierde. Va a la carpeta de registros de la app, con un archivo anterior de reserva.
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: Some("ukiku-pc".into()) }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(1024 * 1024)
                .rotation_strategy(RotationStrategy::KeepSome(2))
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_libmpv::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // La base vive en el directorio de datos locales de la app (no Roaming). Si no se puede
            // abrir (p. ej. es de una versión más nueva), la app arranca igual y cada comando de
            // datos devuelve ese motivo: los datos nunca impiden ver un episodio.
            let conexion = app
                .path()
                .app_local_data_dir()
                .map_err(|e| e.to_string())
                .and_then(|dir| {
                    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                    datos::abrir(&dir.join("ukiku.db")).map_err(|e| e.to_string())
                });
            if let Err(motivo) = &conexion {
                log::error!("[datos] no disponible: {motivo}");
            }
            app.manage(datos::comandos::Datos(Mutex::new(conexion)));
            // Sin icono la app sigue sirviendo (solo no podría esconderse en la bandeja): no impide arrancar.
            let oculta = std::env::args().any(|a| a == bandeja::ARG_OCULTA);
            if let Err(e) = bandeja::crear(app, oculta) {
                log::error!("[bandeja] no se pudo crear el icono: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            resolve_webview,
            abrir_registros,
            bandeja::bandeja_visible,
            datos::comandos::estado_datos,
            datos::comandos::guardar_progreso,
            datos::comandos::marcar_visto,
            datos::comandos::progreso_de,
            datos::comandos::progreso_de_serie,
            datos::comandos::episodios_vistos,
            datos::comandos::continuar_viendo,
            datos::comandos::descartar_progreso,
            datos::comandos::desmarcar_visto,
            datos::comandos::leer_ajuste,
            datos::comandos::guardar_ajuste,
            datos::comandos::estado_serie,
            datos::comandos::fijar_estado,
            datos::comandos::es_favorito,
            datos::comandos::alternar_favorito,
            datos::comandos::listar_biblioteca,
            datos::comandos::listar_historial,
            datos::comandos::guardar_media,
            datos::comandos::leer_media,
            datos::comandos::fijar_vinculo,
            datos::comandos::vinculo_con_media,
            datos::comandos::pendientes_emparejar,
            datos::comandos::reintentar_ningunos,
            datos::comandos::vinculos_auto,
            datos::comandos::guardar_emision,
            datos::comandos::emision_entre,
            datos::comandos::resumenes_vinculados,
            datos::comandos::previsualizar_copia,
            datos::comandos::importar_copia,
            datos::comandos::series_para_sync,
            datos::comandos::aplicar_bajadas,
            datos::comandos::avisos_candidatas,
            datos::comandos::avisos_guardar,
            datos::comandos::tmdb_leer,
            datos::comandos::tmdb_guardar,
            datos::comandos::exportar_copia,
            datos::comandos::crear_respaldo,
            datos::comandos::carpeta_respaldos,
            datos::comandos::limpiar_cache_tmdb,
            datos::comandos::restaurar_copia,
            datos::comandos::guardar_cuenta,
            datos::comandos::leer_cuenta,
            datos::comandos::borrar_cuenta,
            datos::comandos::marcar_sincronizada,
            token::guardar_token_anilist,
            token::leer_token_anilist,
            token::borrar_token_anilist,
            token::guardar_clave_tmdb,
            token::leer_clave_tmdb,
            token::borrar_clave_tmdb,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación de Tauri");
}
