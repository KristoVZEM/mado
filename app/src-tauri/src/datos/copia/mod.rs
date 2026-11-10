//! Importación de la copia de seguridad de Ukiku: una carpeta con archivos JSON versión 2. La
//! interfaz solo pasa la ruta de la carpeta que devuelve el diálogo nativo; aquí se leen únicamente
//! los archivos de nombre fijo, se validan y se aplican. Cada archivo tiene su módulo.

pub mod favoritos;
pub mod historial;
pub mod siguiendo;

use super::progreso::MAX_TEXTO;
use super::{Error, Resultado};
use rusqlite::Connection;
use serde_json::Value;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Tope de tamaño de cada archivo. El `history` real pesa unos 275 KB para 2000 episodios; 20 MiB
/// admite ~150 000.
pub const MAX_BYTES: u64 = 20 * 1024 * 1024;
const VERSION_COPIA: i64 = 2;

/// Nombres fijos de los archivos de la copia: Rust no lee ningún otro de la carpeta.
const HISTORY: &str = "history";
const FOLLOWING: &str = "following";
const FAVS: &str = "favs";

/// Texto no vacío (tras recortar) y de longitud acotada.
fn texto(v: Option<&Value>) -> Option<String> {
    let s = v?.as_str()?.trim();
    if s.is_empty() || s.len() > MAX_TEXTO { None } else { Some(s.to_string()) }
}

/// Valida la envoltura `{version: 2, data: [...]}` común a los archivos y devuelve `data`.
fn lista_de(contenido: &str) -> Resultado<Vec<Value>> {
    let mut raiz: Value =
        serde_json::from_str(contenido).map_err(|_| Error::Invalido("el archivo no es un JSON válido".into()))?;
    match raiz.get("version").and_then(Value::as_i64) {
        Some(VERSION_COPIA) => {}
        Some(otra) => {
            return Err(Error::Invalido(format!("versión de copia no soportada: {otra} (se espera {VERSION_COPIA})")));
        }
        None => {
            return Err(Error::Invalido("el archivo no parece de una copia de Ukiku (falta la versión)".into()));
        }
    }
    match raiz.get_mut("data").map(Value::take) {
        Some(Value::Array(datos)) => Ok(datos),
        _ => Err(Error::Invalido("el archivo no trae la lista de datos".into())),
    }
}

/// Solo rutas con letra de unidad (`C:\…` o `\\?\C:\…`). En Windows `/` también separa, así que se
/// mira el tipo de prefijo y no el texto: `//host/share/x` es una ruta de red igual que `\\host\share\x`
/// y `std::fs` la seguiría (con autenticación NTLM incluida). Fuera de Windows no hay prefijos.
#[cfg(windows)]
fn es_ruta_de_disco(ruta: &Path) -> bool {
    use std::path::{Component, Prefix};
    matches!(
        ruta.components().next(),
        Some(Component::Prefix(p)) if matches!(p.kind(), Prefix::Disk(_) | Prefix::VerbatimDisk(_))
    )
}

#[cfg(not(windows))]
fn es_ruta_de_disco(_ruta: &Path) -> bool {
    true
}

/// Lee un archivo con tope de tamaño (a lo sumo `MAX_BYTES + 1` bytes) y lo devuelve como texto.
fn leer_texto(ruta: &Path) -> Resultado<String> {
    if !std::fs::metadata(ruta)?.is_file() {
        return Err(Error::Invalido("la ruta no es un archivo".into()));
    }
    let mut bytes = Vec::new();
    std::fs::File::open(ruta)?.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(Error::Invalido("el archivo es demasiado grande para ser una copia de Ukiku".into()));
    }
    String::from_utf8(bytes).map_err(|_| Error::Invalido("el archivo no es texto (UTF-8)".into()))
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Modo {
    Mezclar,
    Reemplazar,
}

impl Modo {
    pub fn desde_texto(t: &str) -> Resultado<Modo> {
        match t {
            "mezclar" => Ok(Modo::Mezclar),
            "reemplazar" => Ok(Modo::Reemplazar),
            _ => Err(Error::Invalido("modo de importación desconocido".into())),
        }
    }
}

/// Copia de la base antes de reemplazar: `ukiku.db` -> `ukiku.db.reemplazo-<ms>.bak`. Cada
/// reemplazo deja su propia copia (nunca se pisa una anterior) y solo se conservan las
/// `COPIAS_A_CONSERVAR` más recientes; se escribe en un `.tmp` de nombre único y se renombra al
/// terminar. `None` si la base no está en disco (`path()` es `Some("")` en memoria).
fn copia_previa(conn: &Connection) -> Resultado<Option<PathBuf>> {
    let ahora_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    copia_previa_en(conn, ahora_ms)
}

/// Copias `<db>.reemplazo-*.bak` que se conservan (la recién creada incluida); las más viejas se borran.
const COPIAS_A_CONSERVAR: usize = 3;

/// Clave de orden de una copia `<prefijo><ms>[-<n>].bak`: `(ms, n)`. `None` si el nombre no encaja.
fn orden_de_copia(nombre: &str, prefijo: &str) -> Option<(u128, u32)> {
    let medio = nombre.strip_prefix(prefijo)?.strip_suffix(".bak")?;
    match medio.split_once('-') {
        Some((ms, n)) => Some((ms.parse().ok()?, n.parse().ok()?)),
        None => Some((medio.parse().ok()?, 0)),
    }
}

/// Borra las copias previas de `ruta` más allá de las `COPIAS_A_CONSERVAR` más recientes. Nunca toca
/// `nueva`. Un fallo al borrar no es un error del reemplazo: la copia ya está hecha.
fn podar_copias(ruta: &Path, nueva: &Path) {
    let (Some(carpeta), Some(base)) = (ruta.parent(), ruta.file_name()) else {
        return;
    };
    let prefijo = format!("{}.reemplazo-", base.to_string_lossy());
    let Ok(entradas) = std::fs::read_dir(carpeta) else {
        return;
    };
    let mut copias: Vec<((u128, u32), PathBuf)> = entradas
        .flatten()
        .filter_map(|e| Some((orden_de_copia(&e.file_name().to_string_lossy(), &prefijo)?, e.path())))
        .collect();
    copias.sort_by_key(|(orden, _)| std::cmp::Reverse(*orden));
    for (_, vieja) in copias.into_iter().skip(COPIAS_A_CONSERVAR) {
        if vieja != nueva {
            let _ = std::fs::remove_file(vieja);
        }
    }
}

/// Escribe la copia en `temporal` y la renombra a `copia`. Si algo falla no deja el temporal.
fn escribir_copia(conn: &Connection, temporal: &Path, copia: &Path) -> Resultado<()> {
    let hecho = conn
        .execute("VACUUM INTO ?1", [temporal.to_string_lossy().as_ref()])
        .map(|_| ())
        .map_err(Error::from)
        .and_then(|()| std::fs::rename(temporal, copia).map_err(Error::from));
    if hecho.is_err() {
        let _ = std::fs::remove_file(temporal);
    }
    hecho
}

fn copia_previa_en(conn: &Connection, ahora_ms: u128) -> Resultado<Option<PathBuf>> {
    let Some(ruta) = conn.path().filter(|p| !p.is_empty()) else {
        return Ok(None);
    };
    let con_sufijo = |sufijo: &str| {
        let mut nombre = std::ffi::OsString::from(ruta);
        nombre.push(sufijo);
        PathBuf::from(nombre)
    };
    let mut estampa = ahora_ms.to_string();
    let mut n = 1u32;
    while con_sufijo(&format!(".reemplazo-{estampa}.bak")).exists() {
        estampa = format!("{ahora_ms}-{n}");
        n += 1;
    }
    let copia = con_sufijo(&format!(".reemplazo-{estampa}.bak"));
    // Mismo sello que la copia, así que es único; uno viejo con ese nombre es resto de un fallo.
    let temporal = con_sufijo(&format!(".reemplazo-{estampa}.tmp"));
    if temporal.exists() {
        std::fs::remove_file(&temporal)?;
    }
    escribir_copia(conn, &temporal, &copia)?;
    podar_copias(Path::new(ruta), &copia);
    Ok(Some(copia))
}

/// Una lista de la copia ya validada, con `aid` único.
#[derive(Debug)]
pub struct Lista<T> {
    pub registros: Vec<T>,
    pub invalidos: u32,
}

/// Valida cada elemento con `validar`; los que no sirven se cuentan. Con `aid` repetido gana el
/// último del archivo. Una lista vacía es válida; una con elementos y ninguno válido, no.
fn lista_por_aid<T>(datos: Vec<Value>, validar: fn(&Value) -> Option<T>, aid: fn(&T) -> i64) -> Resultado<Lista<T>> {
    let mut por_aid: HashMap<i64, T> = HashMap::new();
    let mut invalidos = 0u32;
    for v in &datos {
        match validar(v) {
            Some(r) => {
                por_aid.insert(aid(&r), r);
            }
            None => invalidos += 1,
        }
    }
    if !datos.is_empty() && por_aid.is_empty() {
        return Err(Error::Invalido("el archivo no tiene ningún registro válido".into()));
    }
    let mut registros: Vec<T> = por_aid.into_values().collect();
    registros.sort_by_key(aid);
    Ok(Lista { registros, invalidos })
}

/// `tabla` es siempre un nombre fijo del código (`siguiendo` o `favoritos`), nunca de la entrada.
fn existe_aid(conn: &Connection, tabla: &'static str, aid: i64) -> Resultado<bool> {
    Ok(conn.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {tabla} WHERE aid = ?1)"), [aid], |f| f.get(0))?)
}

/// Vista previa de `following` o `favs`: series por `aid`. `actuales` son las filas que hay ahora
/// en la tabla (las que borraría reemplazar).
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenLista {
    pub total: u32,
    pub nuevos: u32,
    pub existentes: u32,
    pub invalidos: u32,
    pub actuales: u32,
}

fn resumen_por_aid(conn: &Connection, tabla: &'static str, aids: &[i64], invalidos: u32) -> Resultado<ResumenLista> {
    let mut nuevos = 0u32;
    for &aid in aids {
        if !existe_aid(conn, tabla, aid)? {
            nuevos += 1;
        }
    }
    let total = aids.len() as u32;
    let actuales: u32 = conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0))?;
    Ok(ResumenLista { total, nuevos, existentes: total - nuevos, invalidos, actuales })
}

/// Lo leído de la carpeta. Cada campo es `None` si su archivo no estaba (su nombre va en `ausentes`).
#[derive(Debug)]
pub struct Carpeta {
    pub historial: Option<historial::Lectura>,
    pub siguiendo: Option<Lista<siguiendo::EntradaSiguiendo>>,
    pub favoritos: Option<Lista<favoritos::EntradaFavorito>>,
    pub ausentes: Vec<String>,
}

/// Contenido de `carpeta/nombre`, o `None` si no existe.
fn leer_si_existe(carpeta: &Path, nombre: &str) -> Resultado<Option<String>> {
    let ruta = carpeta.join(nombre);
    match std::fs::symlink_metadata(&ruta) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
        Ok(m) if m.file_type().is_symlink() => Err(Error::Invalido("es un enlace; no se sigue".into())),
        Ok(_) => leer_texto(&ruta).map(Some),
    }
}

/// Lee y valida un archivo de la carpeta; si falta, apunta su nombre en `ausentes`. Los errores
/// llevan delante el nombre del archivo: uno presente pero inválido no se omite en silencio.
fn leer<T>(
    carpeta: &Path,
    nombre: &str,
    parsear: fn(&str) -> Resultado<T>,
    ausentes: &mut Vec<String>,
) -> Resultado<Option<T>> {
    let leido = leer_si_existe(carpeta, nombre).and_then(|t| t.as_deref().map(parsear).transpose());
    match leido {
        Ok(None) => {
            ausentes.push(nombre.to_string());
            Ok(None)
        }
        Ok(algo) => Ok(algo),
        Err(e) => Err(Error::Invalido(format!("{nombre}: {e}"))),
    }
}

/// Lee la copia de Ukiku de `carpeta`: solo los archivos de nombre fijo (`history`, `following`,
/// `favs`). Solo acepta rutas absolutas de disco local (la que devuelve el diálogo nativo). Un
/// archivo ausente se informa; si no hay ninguno, es error.
pub fn leer_carpeta(carpeta: &Path) -> Resultado<Carpeta> {
    if !carpeta.is_absolute() {
        return Err(Error::Invalido("la ruta de la carpeta debe ser absoluta".into()));
    }
    if !es_ruta_de_disco(carpeta) {
        return Err(Error::Invalido("no se admiten rutas de red ni de dispositivo".into()));
    }
    if !std::fs::metadata(carpeta)?.is_dir() {
        return Err(Error::Invalido("la ruta no es una carpeta".into()));
    }
    let mut ausentes = Vec::new();
    let historial = leer(carpeta, HISTORY, historial::parsear, &mut ausentes)?;
    let siguiendo = leer(carpeta, FOLLOWING, siguiendo::parsear, &mut ausentes)?;
    let favoritos = leer(carpeta, FAVS, favoritos::parsear, &mut ausentes)?;
    if historial.is_none() && siguiendo.is_none() && favoritos.is_none() {
        return Err(Error::Invalido(
            "la carpeta no tiene ningún archivo de la copia de Ukiku (history, following, favs)".into(),
        ));
    }
    Ok(Carpeta { historial, siguiendo, favoritos, ausentes })
}

/// Vista previa de la carpeta: `None` en los archivos que no están.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenCopia {
    pub historial: Option<historial::Resumen>,
    pub siguiendo: Option<ResumenLista>,
    pub favoritos: Option<ResumenLista>,
    pub ausentes: Vec<String>,
}

/// Lo que pasaría al importar la carpeta, sin escribir nada.
pub fn previsualizar(conn: &Connection, c: &Carpeta) -> Resultado<ResumenCopia> {
    Ok(ResumenCopia {
        historial: c.historial.as_ref().map(|l| historial::previsualizar(conn, l)).transpose()?,
        siguiendo: c.siguiendo.as_ref().map(|l| siguiendo::previsualizar(conn, l)).transpose()?,
        favoritos: c.favoritos.as_ref().map(|l| favoritos::previsualizar(conn, l)).transpose()?,
        ausentes: c.ausentes.clone(),
    })
}

/// Lo aplicado de un archivo.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aplicado {
    pub nuevos: u32,
    pub actualizados: u32,
    pub invalidos: u32,
}

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AplicadoCopia {
    pub historial: Option<Aplicado>,
    pub siguiendo: Option<Aplicado>,
    pub favoritos: Option<Aplicado>,
    /// Ruta de la copia previa de la base (solo al reemplazar).
    pub copia: Option<String>,
}

/// Aplica la carpeta en una sola transacción: si algo falla no queda nada a medias. Reemplazar
/// exige una copia previa de la base en disco (sin ella no se toca nada), solo vacía las tablas de
/// los archivos presentes y nunca borra de `anime`.
pub fn aplicar(conn: &Connection, c: &Carpeta, modo: Modo) -> Resultado<AplicadoCopia> {
    aplicar_interno(conn, c, modo, true)
}

fn aplicar_interno(conn: &Connection, c: &Carpeta, modo: Modo, exigir_copia: bool) -> Resultado<AplicadoCopia> {
    let reemplazar = modo == Modo::Reemplazar;
    // VACUUM INTO no puede ir dentro de una transacción.
    let copia = if reemplazar { copia_previa(conn)? } else { None };
    if reemplazar && exigir_copia && copia.is_none() {
        return Err(Error::Invalido("no se pudo preparar la copia previa de la base; no se reemplaza nada".into()));
    }
    let tx = conn.unchecked_transaction()?;
    let historial = c.historial.as_ref().map(|l| historial::aplicar_en(&tx, l, reemplazar)).transpose()?;
    let siguiendo = c.siguiendo.as_ref().map(|l| siguiendo::aplicar_en(&tx, l, reemplazar)).transpose()?;
    let favoritos = c.favoritos.as_ref().map(|l| favoritos::aplicar_en(&tx, l, reemplazar)).transpose()?;
    tx.commit()?;
    Ok(AplicadoCopia { historial, siguiendo, favoritos, copia: copia.map(|p| p.to_string_lossy().into_owned()) })
}

#[cfg(test)]
mod pruebas;
