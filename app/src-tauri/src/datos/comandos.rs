//! Comandos de Tauri: envoltorios finos sobre las funciones de `datos`. La interfaz nunca escribe
//! SQL; aquí solo se toma la conexión, se llama a la función y se traduce el error a `String`.

use super::progreso::{self, EntradaContinuar, Serie};
use super::{ajustes, Resultado};
use rusqlite::Connection;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

/// Estado de Tauri: la conexión, o el motivo por el que no se pudo abrir (p. ej. base más nueva).
pub struct Datos(pub Mutex<Result<Connection, String>>);

fn ahora_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Toma la conexión y ejecuta `f`. Si la base no está disponible, devuelve ese mensaje.
fn con<T>(datos: &State<'_, Datos>, f: impl FnOnce(&Connection) -> Resultado<T>) -> Result<T, String> {
    let guardia = datos.0.lock().map_err(|_| "la base de datos quedó en un estado inconsistente".to_string())?;
    match &*guardia {
        Ok(conn) => f(conn).map_err(|e| e.to_string()),
        Err(motivo) => Err(motivo.clone()),
    }
}

/// `None` si la base funciona; si no, el mensaje para mostrar un aviso fijo en la interfaz.
#[tauri::command]
pub fn estado_datos(datos: State<'_, Datos>) -> Option<String> {
    match datos.0.lock() {
        Ok(g) => g.as_ref().err().cloned(),
        Err(_) => Some("la base de datos quedó en un estado inconsistente".to_string()),
    }
}

#[tauri::command(async)]
pub fn guardar_progreso(
    datos: State<'_, Datos>,
    aid: i64,
    slug: String,
    titulo: String,
    numero: f64,
    posicion_s: f64,
    duracion_s: f64,
) -> Result<(), String> {
    con(&datos, |c| {
        let serie = Serie { aid, slug: &slug, titulo: &titulo };
        progreso::guardar_progreso(c, ahora_ms(), &serie, numero, posicion_s, duracion_s)
    })
}

#[tauri::command(async)]
pub fn marcar_visto(
    datos: State<'_, Datos>,
    aid: i64,
    slug: String,
    titulo: String,
    numero: f64,
    siguiente: Option<f64>,
) -> Result<(), String> {
    con(&datos, |c| {
        let serie = Serie { aid, slug: &slug, titulo: &titulo };
        progreso::marcar_visto(c, ahora_ms(), &serie, numero, siguiente)
    })
}

#[tauri::command(async)]
pub fn progreso_de(datos: State<'_, Datos>, aid: i64, numero: f64) -> Result<Option<f64>, String> {
    con(&datos, |c| progreso::progreso_de(c, aid, numero))
}

/// El límite se acota a 1–50: es una lista de tarjetas, no una consulta abierta.
#[tauri::command(async)]
pub fn continuar_viendo(datos: State<'_, Datos>, limite: u32) -> Result<Vec<EntradaContinuar>, String> {
    con(&datos, |c| progreso::continuar_viendo(c, limite.clamp(1, 50)))
}

#[tauri::command(async)]
pub fn descartar_progreso(datos: State<'_, Datos>, aid: i64) -> Result<(), String> {
    con(&datos, |c| progreso::descartar_progreso(c, aid))
}

#[tauri::command(async)]
pub fn leer_ajuste(datos: State<'_, Datos>, clave: String) -> Result<Option<String>, String> {
    con(&datos, |c| ajustes::leer(c, &clave))
}

#[tauri::command(async)]
pub fn guardar_ajuste(datos: State<'_, Datos>, clave: String, valor: String) -> Result<(), String> {
    con(&datos, |c| ajustes::guardar(c, &clave, &valor))
}
