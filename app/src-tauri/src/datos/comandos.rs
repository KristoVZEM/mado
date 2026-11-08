//! Comandos de Tauri: envoltorios finos sobre las funciones de `datos`. La interfaz nunca escribe
//! SQL; aquí solo se toma la conexión, se llama a la función y se traduce el error a `String`.

use super::anilist;
use super::copia::{self, AplicadoCopia, Modo, ResumenCopia};
use super::progreso::{self, EntradaContinuar, EntradaHistorial, Serie};
use super::{ajustes, Resultado};
use super::biblioteca::{self, Biblioteca};
use rusqlite::Connection;
use std::path::Path;
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
    anteriores: Option<Vec<f64>>,
) -> Result<(), String> {
    con(&datos, |c| {
        let serie = Serie { aid, slug: &slug, titulo: &titulo };
        progreso::marcar_visto(c, ahora_ms(), &serie, numero, siguiente, &anteriores.unwrap_or_default())
    })
}

#[tauri::command(async)]
pub fn episodios_vistos(datos: State<'_, Datos>, aid: i64) -> Result<Vec<f64>, String> {
    con(&datos, |c| progreso::episodios_vistos(c, aid))
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
pub fn guardar_media(datos: State<'_, Datos>, media: anilist::MediaAnilist) -> Result<(), String> {
    con(&datos, |c| anilist::guardar_media(c, ahora_ms(), &media))
}

#[tauri::command(async)]
pub fn leer_media(datos: State<'_, Datos>, anilist_id: i64) -> Result<Option<anilist::MediaAnilist>, String> {
    con(&datos, |c| anilist::leer_media(c, anilist_id))
}

#[tauri::command(async)]
pub fn fijar_vinculo(
    datos: State<'_, Datos>,
    aid: i64,
    slug: String,
    titulo: String,
    anilist_id: Option<i64>,
    confianza: f64,
    origen: String,
) -> Result<bool, String> {
    con(&datos, |c| {
        let serie = Serie { aid, slug: &slug, titulo: &titulo };
        anilist::fijar_vinculo(c, ahora_ms(), &serie, anilist_id, confianza, &origen)
    })
}

#[tauri::command(async)]
pub fn vinculo_con_media(datos: State<'_, Datos>, aid: i64) -> Result<Option<anilist::VinculoConMedia>, String> {
    con(&datos, |c| anilist::vinculo_con_media(c, aid))
}

/// El límite se acota a 1–100.
#[tauri::command(async)]
pub fn pendientes_emparejar(datos: State<'_, Datos>, limite: u32) -> Result<Vec<anilist::PendienteEmparejar>, String> {
    con(&datos, |c| anilist::pendientes_emparejar(c, ahora_ms(), limite.clamp(1, 100)))
}

#[tauri::command(async)]
pub fn guardar_emision(
    datos: State<'_, Datos>,
    desde: i64,
    hasta: i64,
    medias: Vec<anilist::MediaAnilist>,
    items: Vec<anilist::ItemEmision>,
) -> Result<(), String> {
    con(&datos, |c| anilist::guardar_emision(c, ahora_ms(), desde, hasta, &medias, &items))
}

#[tauri::command(async)]
pub fn emision_entre(datos: State<'_, Datos>, desde: i64, hasta: i64) -> Result<Vec<anilist::EntradaEmision>, String> {
    con(&datos, |c| anilist::emision_entre(c, desde, hasta))
}

#[tauri::command(async)]
pub fn resumenes_vinculados(datos: State<'_, Datos>) -> Result<Vec<anilist::ResumenSerie>, String> {
    con(&datos, anilist::resumenes_vinculados)
}

/// El límite se acota a 1–100: el historial puede tener miles de filas y se pide por páginas.
#[tauri::command(async)]
pub fn listar_historial(
    datos: State<'_, Datos>,
    limite: u32,
    desplazamiento: u32,
) -> Result<Vec<EntradaHistorial>, String> {
    con(&datos, |c| progreso::listar_historial(c, limite.clamp(1, 100), desplazamiento))
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

#[tauri::command(async)]
pub fn estado_serie(datos: State<'_, Datos>, aid: i64) -> Result<Option<u8>, String> {
    con(&datos, |c| biblioteca::estado_serie(c, aid))
}

/// `estado`: 0 deja de seguir la serie; 1 Viendo, 2 Considerando, 3 Completado, 4 Dropeado, 5 Pausado.
#[tauri::command(async)]
pub fn fijar_estado(
    datos: State<'_, Datos>,
    aid: i64,
    slug: String,
    titulo: String,
    estado: u8,
) -> Result<(), String> {
    con(&datos, |c| biblioteca::fijar_estado(c, &Serie { aid, slug: &slug, titulo: &titulo }, estado))
}

#[tauri::command(async)]
pub fn es_favorito(datos: State<'_, Datos>, aid: i64) -> Result<bool, String> {
    con(&datos, |c| biblioteca::es_favorito(c, aid))
}

/// Devuelve si la serie queda marcada como favorita.
#[tauri::command(async)]
pub fn alternar_favorito(datos: State<'_, Datos>, aid: i64, slug: String, titulo: String) -> Result<bool, String> {
    con(&datos, |c| biblioteca::alternar_favorito(c, &Serie { aid, slug: &slug, titulo: &titulo }))
}

#[tauri::command(async)]
pub fn listar_biblioteca(datos: State<'_, Datos>) -> Result<Biblioteca, String> {
    con(&datos, biblioteca::listar_biblioteca)
}

/// Lee y valida la carpeta de la copia de Ukiku sin escribir nada. La interfaz solo manda la ruta
/// de la carpeta del diálogo; los archivos se leen antes de tomar la base.
#[tauri::command(async)]
pub fn previsualizar_copia(datos: State<'_, Datos>, carpeta: String) -> Result<ResumenCopia, String> {
    let leida = copia::leer_carpeta(Path::new(&carpeta)).map_err(|e| e.to_string())?;
    con(&datos, |c| copia::previsualizar(c, &leida))
}

/// Importa la carpeta de la copia de Ukiku. `modo` es "mezclar" o "reemplazar".
#[tauri::command(async)]
pub fn importar_copia(datos: State<'_, Datos>, carpeta: String, modo: String) -> Result<AplicadoCopia, String> {
    let modo = Modo::desde_texto(&modo).map_err(|e| e.to_string())?;
    let leida = copia::leer_carpeta(Path::new(&carpeta)).map_err(|e| e.to_string())?;
    con(&datos, |c| copia::aplicar(c, &leida, modo))
}
