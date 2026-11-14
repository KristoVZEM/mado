//! Icono en la bandeja del sistema. Solo se ve si el usuario eligió «seguir en la bandeja al cerrar»
//! (o si la app arrancó oculta con Windows): con la ventana escondida es la única forma de volver a ella.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager};

const ID: &str = "principal";

/// Argumento con el que Windows lanza la app al iniciar sesión: arranca sin mostrar la ventana.
pub const ARG_OCULTA: &str = "--oculta";

/// Trae la ventana principal al frente, esté escondida, minimizada o detrás de otra.
pub fn mostrar_principal(app: &AppHandle) {
    if let Some(ventana) = app.get_webview_window("main") {
        let _ = ventana.show();
        // Solo se restaura si está minimizada: restaurar una ventana visible le quitaría el maximizado.
        if ventana.is_minimized().unwrap_or(false) {
            let _ = ventana.unminimize();
        }
        let _ = ventana.set_focus();
    }
}

/// Crea el icono (escondido salvo que la app arranque oculta) con su menú: Abrir y Salir.
pub fn crear(app: &App, oculta: bool) -> tauri::Result<()> {
    let abrir = MenuItem::with_id(app, "abrir", "Abrir Mado", true, None::<&str>)?;
    let salir = MenuItem::with_id(app, "salir", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&abrir, &salir])?;
    let mut constructor = TrayIconBuilder::with_id(ID)
        .tooltip("Mado")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id.as_ref() {
            "abrir" => mostrar_principal(app),
            "salir" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|icono, evento| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                mostrar_principal(icono.app_handle());
            }
        });
    if let Some(icono) = app.default_window_icon() {
        constructor = constructor.icon(icono.clone());
    }
    let icono = constructor.build(app)?;
    icono.set_visible(oculta)?;
    if oculta && let Some(ventana) = app.get_webview_window("main") {
        let _ = ventana.hide();
    }
    Ok(())
}

/// Muestra o esconde el icono según el ajuste. Con la ventana escondida no se quita nunca: dejaría la
/// app abierta sin forma de llegar a ella.
#[tauri::command]
pub fn bandeja_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let ventana_a_la_vista =
        app.get_webview_window("main").map(|v| v.is_visible().unwrap_or(true)).unwrap_or(true);
    let Some(icono) = app.tray_by_id(ID) else { return Ok(()) };
    icono.set_visible(visible || !ventana_a_la_vista).map_err(|e| e.to_string())
}
