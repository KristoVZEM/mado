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
/// reemplazo deja su propia copia (nunca se pisa una anterior); se escribe en un `.tmp` y se
/// renombra al terminar. `None` si la base no está en disco (`path()` es `Some("")` en memoria).
fn copia_previa(conn: &Connection) -> Resultado<Option<PathBuf>> {
    let Some(ruta) = conn.path().filter(|p| !p.is_empty()) else {
        return Ok(None);
    };
    let ahora_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let con_sufijo = |sufijo: &str| {
        let mut nombre = std::ffi::OsString::from(ruta);
        nombre.push(sufijo);
        PathBuf::from(nombre)
    };
    let mut copia = con_sufijo(&format!(".reemplazo-{ahora_ms}.bak"));
    let mut n = 1u32;
    while copia.exists() {
        copia = con_sufijo(&format!(".reemplazo-{ahora_ms}-{n}.bak"));
        n += 1;
    }
    let temporal = con_sufijo(".reemplazo.tmp");
    if temporal.exists() {
        std::fs::remove_file(&temporal)?;
    }
    conn.execute("VACUUM INTO ?1", [temporal.to_string_lossy().as_ref()])?;
    std::fs::rename(&temporal, &copia)?;
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
mod pruebas {
    use super::*;
    use crate::datos::progreso::{marcar_visto, Serie};
    use crate::datos::{abrir, abrir_en_memoria};
    use rusqlite::params;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SECUENCIA: AtomicU32 = AtomicU32::new(0);

    /// Sufijo único por prueba: varias corren a la vez en hilos distintos.
    fn unico() -> String {
        let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        format!("{}-{nanos}-{}", std::process::id(), SECUENCIA.fetch_add(1, Ordering::Relaxed))
    }

    fn json(registros: &str) -> String {
        format!(r#"{{"version":2,"date":"08/11/2026 18:22","data":[{registros}]}}"#)
    }

    fn visto(aid: i64, numero: &str, fecha: i64) -> String {
        format!(r#"{{"aid":{aid},"date":{fecha},"eid":1,"name":"Serie {aid}","number":{numero},"slug":"serie-{aid}"}}"#)
    }

    /// Carpeta temporal nueva con los archivos dados.
    fn carpeta(archivos: &[(&str, &[u8])]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ukiku-copia-{}", unico()));
        std::fs::create_dir(&dir).unwrap();
        for &(nombre, contenido) in archivos {
            std::fs::write(dir.join(nombre), contenido).unwrap();
        }
        dir
    }

    fn borrar(dir: &Path) {
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Escribe una carpeta temporal con esos archivos, la lee y la borra.
    fn leida(archivos: &[(&str, String)]) -> Carpeta {
        let bytes: Vec<(&str, &[u8])> = archivos.iter().map(|(n, c)| (*n, c.as_bytes())).collect();
        let dir = carpeta(&bytes);
        let c = leer_carpeta(&dir).unwrap();
        borrar(&dir);
        c
    }

    /// Error al leer una carpeta que solo tiene `nombre` con ese contenido.
    fn error_de(nombre: &str, contenido: &[u8]) -> String {
        let dir = carpeta(&[(nombre, contenido)]);
        let err = leer_carpeta(&dir).unwrap_err().to_string();
        borrar(&dir);
        err
    }

    fn base_en_disco() -> (Connection, PathBuf) {
        let ruta = std::env::temp_dir().join(format!("ukiku-reemplazo-{}.db", unico()));
        (abrir(&ruta).unwrap(), ruta)
    }

    /// Borra la base y todo lo que cuelga de su nombre (wal, shm, copias, tmp).
    fn limpiar(ruta: &Path) {
        let prefijo = ruta.file_name().unwrap().to_string_lossy().into_owned();
        for e in std::fs::read_dir(ruta.parent().unwrap()).unwrap().flatten() {
            if e.file_name().to_string_lossy().starts_with(&prefijo) {
                let _ = std::fs::remove_file(e.path());
                let _ = std::fs::remove_dir(e.path());
            }
        }
    }

    fn copias(ruta: &Path) -> Vec<PathBuf> {
        let prefijo = format!("{}.reemplazo-", ruta.file_name().unwrap().to_string_lossy());
        std::fs::read_dir(ruta.parent().unwrap())
            .unwrap()
            .flatten()
            .filter(|e| {
                let n = e.file_name().to_string_lossy().into_owned();
                n.starts_with(&prefijo) && n.ends_with(".bak")
            })
            .map(|e| e.path())
            .collect()
    }

    fn contar(conn: &Connection, tabla: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0)).unwrap()
    }

    fn visto_en(conn: &Connection, aid: i64, numero: f64) -> Option<i64> {
        conn.query_row("SELECT visto_en FROM historial WHERE aid = ?1 AND numero = ?2", params![aid, numero], |f| f.get(0))
            .ok()
    }

    /// Base con un episodio visto (aid 1, ep. 1, fecha 5000, título "Título local"), aid 1 en
    /// Viendo y aid 1 favorito con categoría "Vieja".
    fn sembrar(conn: &Connection) {
        marcar_visto(conn, 5000, &Serie { aid: 1, slug: "serie-1", titulo: "Título local" }, 1.0, None, &[]).unwrap();
        conn.execute("INSERT INTO siguiendo (aid, estado) VALUES (1, 1)", []).unwrap();
        conn.execute("INSERT INTO favoritos (aid, categoria) VALUES (1, 'Vieja')", []).unwrap();
    }

    #[test]
    fn el_modo_se_lee_de_un_texto_y_rechaza_otros() {
        assert_eq!(Modo::desde_texto("mezclar").unwrap(), Modo::Mezclar);
        assert_eq!(Modo::desde_texto("reemplazar").unwrap(), Modo::Reemplazar);
        assert!(Modo::desde_texto("borrar").is_err());
    }

    #[test]
    fn lee_el_history_de_la_carpeta() {
        let c = leida(&[(HISTORY, json(&format!("{},{}", visto(1, "1.0", 10), visto(1, "2.0", 20))))]);
        assert_eq!(c.historial.unwrap().registros.len(), 2);
        assert!(!c.ausentes.contains(&HISTORY.to_string()));
    }

    #[test]
    fn una_carpeta_sin_ninguno_de_los_archivos_es_error() {
        let dir = carpeta(&[("seen", "{}".as_bytes()), ("autobackup", "{}".as_bytes())]);
        let err = leer_carpeta(&dir).unwrap_err().to_string();
        borrar(&dir);
        assert!(err.contains("ningún archivo"), "{err}");
    }

    #[test]
    fn un_history_presente_e_invalido_es_error_con_su_nombre() {
        for (contenido, pista) in [
            (r#"{"version":3,"data":[]}"#.as_bytes(), "3"),
            ("esto no es json".as_bytes(), "JSON"),
            (r#"{"version":2,"data":[]}"#.as_bytes(), "episodio"),
            ([0xffu8, 0xfe, 0x00].as_slice(), "UTF-8"),
        ] {
            let err = error_de(HISTORY, contenido);
            assert!(err.starts_with("history:") && err.contains(pista), "{err}");
        }
    }

    #[test]
    fn un_directorio_con_el_nombre_de_un_archivo_es_error() {
        let dir = carpeta(&[]);
        std::fs::create_dir(dir.join(HISTORY)).unwrap();
        let err = leer_carpeta(&dir).unwrap_err().to_string();
        borrar(&dir);
        assert!(err.starts_with("history:") && err.contains("no es un archivo"), "{err}");
    }

    #[test]
    fn un_archivo_demasiado_grande_es_error() {
        let grande = vec![b' '; MAX_BYTES as usize + 1];
        let err = error_de(HISTORY, &grande);
        assert!(err.starts_with("history:") && err.contains("demasiado grande"), "{err}");
    }

    #[test]
    fn rechaza_rutas_relativas_inexistentes_y_que_no_son_carpeta() {
        assert!(leer_carpeta(Path::new("copia")).unwrap_err().to_string().contains("absoluta"));
        assert!(leer_carpeta(&std::env::temp_dir().join("ukiku-copia-no-existe-jamas")).is_err());
        let dir = carpeta(&[(HISTORY, json(&visto(1, "1.0", 10)).as_bytes())]);
        let err = leer_carpeta(&dir.join(HISTORY)).unwrap_err().to_string();
        borrar(&dir);
        assert!(err.contains("no es una carpeta"), "{err}");
    }

    #[test]
    fn rechaza_rutas_de_red_y_de_dispositivo_con_cualquier_separador() {
        for ruta in [
            r"\\host\share\copia",
            "//host/share/copia",
            r"/\host\share\copia",
            r"\\?\UNC\host\share\copia",
            "//?/UNC/host/share/copia",
            r"\\.\pipe\ukiku",
            "//./NUL",
        ] {
            let err = leer_carpeta(Path::new(ruta)).unwrap_err().to_string();
            assert!(err.contains("red"), "{ruta}: {err}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn acepta_una_carpeta_de_disco_en_forma_verbatim() {
        let dir = carpeta(&[(HISTORY, json(&visto(8, "1.0", 5)).as_bytes())]);
        let verbatim = PathBuf::from(format!(r"\\?\{}", dir.display()));
        let c = leer_carpeta(&verbatim).unwrap();
        borrar(&dir);
        assert_eq!(c.historial.unwrap().registros[0].aid, 8);
    }

    #[test]
    fn previsualizar_resume_el_history_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        let c = leida(&[(HISTORY, json(&format!("{},{}", visto(1, "1.0", 100), visto(1, "2.0", 100))))]);
        let r = previsualizar(&conn, &c).unwrap();
        let h = r.historial.as_ref().unwrap();
        assert_eq!((h.total, h.nuevos, h.existentes, h.actuales), (2, 1, 1, 1));
        assert_eq!(r.ausentes, c.ausentes);
        assert_eq!(contar(&conn, "historial"), 1, "la vista previa no escribe");
    }

    #[test]
    fn mezclar_el_history_conserva_la_fecha_mas_reciente_y_no_hace_copia() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        let c = leida(&[(HISTORY, json(&format!("{},{}", visto(1, "1.0", 100), visto(2, "1.0", 300))))]);
        let r = aplicar(&conn, &c, Modo::Mezclar).unwrap();
        assert_eq!(r.historial, Some(Aplicado { nuevos: 1, actualizados: 1, invalidos: 0 }));
        assert_eq!(r.copia, None);
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "lo local es más reciente");
        assert_eq!(visto_en(&conn, 2, 1.0), Some(300));
    }

    #[test]
    fn reemplazar_guarda_una_unica_copia_previa_y_carga_el_history() {
        let (conn, ruta) = base_en_disco();
        sembrar(&conn);
        let c = leida(&[(HISTORY, json(&visto(2, "1.0", 300)))]);
        let r = aplicar(&conn, &c, Modo::Reemplazar).unwrap();
        assert_eq!(visto_en(&conn, 1, 1.0), None);
        assert_eq!(visto_en(&conn, 2, 1.0), Some(300));
        assert_eq!(contar(&conn, "anime"), 2, "anime nunca se vacía");
        assert_eq!(copias(&ruta).len(), 1);
        let previa = Connection::open(PathBuf::from(r.copia.expect("debe informar la copia"))).unwrap();
        let antes: i64 = previa.query_row("SELECT COUNT(*) FROM historial WHERE aid = 1", [], |f| f.get(0)).unwrap();
        assert_eq!(antes, 1, "la copia es previa al reemplazo");
        drop(previa);
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn dos_reemplazos_seguidos_dejan_dos_copias_distintas() {
        let (conn, ruta) = base_en_disco();
        sembrar(&conn);
        let primera = leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]);
        let segunda = leida(&[(HISTORY, json(&visto(3, "1.0", 1)))]);
        let c1 = PathBuf::from(aplicar(&conn, &primera, Modo::Reemplazar).unwrap().copia.unwrap());
        let c2 = PathBuf::from(aplicar(&conn, &segunda, Modo::Reemplazar).unwrap().copia.unwrap());
        assert_ne!(c1, c2);
        assert_eq!(copias(&ruta).len(), 2);
        let de = |copia: &Path, aid: i64| -> i64 {
            Connection::open(copia)
                .unwrap()
                .query_row("SELECT COUNT(*) FROM historial WHERE aid = ?1", [aid], |f| f.get(0))
                .unwrap()
        };
        assert_eq!((de(&c1, 1), de(&c1, 2)), (1, 0), "la primera copia tiene el historial original");
        assert_eq!((de(&c2, 2), de(&c2, 3)), (1, 0), "la segunda es previa al segundo reemplazo");
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn reemplazar_en_una_base_en_memoria_falla_sin_tocar_nada() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        let r = aplicar(&conn, &leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]), Modo::Reemplazar);
        assert!(r.unwrap_err().to_string().contains("no se reemplaza nada"));
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
    }

    #[test]
    fn si_la_copia_falla_no_se_borra_nada() {
        let (conn, ruta) = base_en_disco();
        sembrar(&conn);
        let mut tmp = std::ffi::OsString::from(&ruta);
        tmp.push(".reemplazo.tmp");
        std::fs::create_dir(&tmp).unwrap();
        assert!(aplicar(&conn, &leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]), Modo::Reemplazar).is_err());
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
        assert!(copias(&ruta).is_empty());
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn un_fallo_a_medias_no_deja_cambios() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        conn.execute_batch("DROP TABLE progreso").unwrap();
        let c = leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]);
        assert!(aplicar_interno(&conn, &c, Modo::Reemplazar, false).is_err());
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "el DELETE del historial se deshizo");
        assert_eq!(visto_en(&conn, 2, 1.0), None);
    }

    fn seguida(aid: i64, estado: u8) -> String {
        format!(r#"{{"aid":{aid},"last_watched":-1,"name":"Serie {aid}","slug":"serie-{aid}","state":{estado}}}"#)
    }

    fn estado_de(conn: &Connection, aid: i64) -> Option<u8> {
        conn.query_row("SELECT estado FROM siguiendo WHERE aid = ?1", [aid], |f| f.get(0)).ok()
    }

    #[test]
    fn lee_el_following_y_si_falta_el_history_lo_informa() {
        let c = leida(&[(FOLLOWING, json(&seguida(1, 3)))]);
        assert!(c.historial.is_none());
        assert_eq!(c.siguiendo.unwrap().registros[0].estado, 3);
        assert!(c.ausentes.contains(&HISTORY.to_string()));
        assert!(!c.ausentes.contains(&FOLLOWING.to_string()));
    }

    #[test]
    fn un_following_presente_e_invalido_es_error_con_su_nombre() {
        for (contenido, pista) in
            [(r#"{"version":3,"data":[]}"#, "3"), (r#"{"version":2,"data":[{"aid":0}]}"#, "registro"), ("{", "JSON")]
        {
            let err = error_de(FOLLOWING, contenido.as_bytes());
            assert!(err.starts_with("following:") && err.contains(pista), "{err}");
        }
    }

    #[test]
    fn previsualizar_resume_el_following_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        let c = leida(&[(FOLLOWING, json(&format!("{},{}", seguida(1, 3), seguida(2, 1))))]);
        let r = previsualizar(&conn, &c).unwrap();
        assert_eq!(r.siguiendo, Some(ResumenLista { total: 2, nuevos: 1, existentes: 1, invalidos: 0, actuales: 1 }));
        assert_eq!(r.historial, None);
        assert_eq!(estado_de(&conn, 1), Some(1), "la vista previa no escribe");
    }

    #[test]
    fn mezclar_el_following_gana_el_archivo_y_no_borra_lo_que_no_viene() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        conn.execute_batch("INSERT INTO anime VALUES (9, 'serie-9', 'Serie 9'); INSERT INTO siguiendo (aid, estado) VALUES (9, 5);")
            .unwrap();
        let c = leida(&[(FOLLOWING, json(&format!("{},{}", seguida(1, 3), seguida(2, 4))))]);
        let r = aplicar(&conn, &c, Modo::Mezclar).unwrap();
        assert_eq!(r.siguiendo, Some(Aplicado { nuevos: 1, actualizados: 1, invalidos: 0 }));
        assert_eq!((estado_de(&conn, 1), estado_de(&conn, 2), estado_de(&conn, 9)), (Some(3), Some(4), Some(5)));
        let titulo: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 1", [], |f| f.get(0)).unwrap();
        assert_eq!(titulo, "Título local", "no pisa títulos");
    }

    #[test]
    fn reemplazar_solo_el_following_no_toca_el_historial_ni_anime() {
        let (conn, ruta) = base_en_disco();
        sembrar(&conn);
        let c = leida(&[(FOLLOWING, json(&seguida(2, 4)))]);
        let r = aplicar(&conn, &c, Modo::Reemplazar).unwrap();
        assert_eq!(r.historial, None);
        assert_eq!((estado_de(&conn, 1), estado_de(&conn, 2)), (None, Some(4)));
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "sin history no se toca el historial");
        assert_eq!(contar(&conn, "anime"), 2);
        assert_eq!(copias(&ruta).len(), 1, "una única copia previa");
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn un_fallo_en_el_following_deshace_tambien_el_historial() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        conn.execute_batch("DROP TABLE siguiendo").unwrap();
        let c = leida(&[(HISTORY, json(&visto(2, "1.0", 1))), (FOLLOWING, json(&seguida(2, 2)))]);
        assert!(aplicar_interno(&conn, &c, Modo::Reemplazar, false).is_err());
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
        assert_eq!(visto_en(&conn, 2, 1.0), None);
    }

    fn favorita(aid: i64, categoria: &str) -> String {
        format!(r#"{{"aid":{aid},"category":"{categoria}","name":"Serie {aid}","slug":"serie-{aid}","type":"tv-anime"}}"#)
    }

    fn categoria_de(conn: &Connection, aid: i64) -> Option<Option<String>> {
        conn.query_row("SELECT categoria FROM favoritos WHERE aid = ?1", [aid], |f| f.get(0)).ok()
    }

    #[test]
    fn informa_los_ausentes_con_uno_dos_y_tres_archivos() {
        let h = (HISTORY, json(&visto(1, "1.0", 10)));
        let s = (FOLLOWING, json(&seguida(1, 1)));
        let f = (FAVS, json(""));
        assert_eq!(leida(std::slice::from_ref(&s)).ausentes, [HISTORY, FAVS]);
        assert_eq!(leida(&[h.clone(), f.clone()]).ausentes, [FOLLOWING]);
        let tres = leida(&[h, s, f]);
        assert!(tres.ausentes.is_empty());
        assert!(tres.historial.is_some() && tres.siguiendo.is_some() && tres.favoritos.is_some());
    }

    #[test]
    fn un_favs_vacio_es_valido() {
        let c = leida(&[(FAVS, json(""))]);
        assert!(c.favoritos.unwrap().registros.is_empty());
    }

    #[test]
    fn un_favs_presente_e_invalido_es_error_con_su_nombre() {
        for (contenido, pista) in [
            (r#"{"version":3,"data":[]}"#.as_bytes(), "3"),
            (r#"{"version":2,"data":[{"aid":0}]}"#.as_bytes(), "registro"),
            ([0xffu8, 0xfe, 0x00].as_slice(), "UTF-8"),
        ] {
            let err = error_de(FAVS, contenido);
            assert!(err.starts_with("favs:") && err.contains(pista), "{err}");
        }
    }

    #[test]
    fn previsualizar_resume_los_favs_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        let c = leida(&[(FAVS, json(&format!("{},{}", favorita(1, "_NONE_"), favorita(2, "Nueva"))))]);
        let r = previsualizar(&conn, &c).unwrap();
        assert_eq!(r.favoritos, Some(ResumenLista { total: 2, nuevos: 1, existentes: 1, invalidos: 0, actuales: 1 }));
        assert_eq!(categoria_de(&conn, 1), Some(Some("Vieja".into())), "la vista previa no escribe");
    }

    #[test]
    fn mezclar_los_favs_gana_el_archivo_en_la_categoria() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        conn.execute_batch("INSERT INTO anime VALUES (9, 'serie-9', 'Serie 9'); INSERT INTO favoritos VALUES (9, 'Otra');")
            .unwrap();
        let c = leida(&[(FAVS, json(&format!("{},{}", favorita(1, "_NONE_"), favorita(2, "Nueva"))))]);
        let r = aplicar(&conn, &c, Modo::Mezclar).unwrap();
        assert_eq!(r.favoritos, Some(Aplicado { nuevos: 1, actualizados: 1, invalidos: 0 }));
        assert_eq!(categoria_de(&conn, 1), Some(None), "gana el archivo, también sin categoría");
        assert_eq!(categoria_de(&conn, 2), Some(Some("Nueva".into())));
        assert_eq!(categoria_de(&conn, 9), Some(Some("Otra".into())), "mezclar no borra lo que no viene");
        let titulo: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 1", [], |f| f.get(0)).unwrap();
        assert_eq!(titulo, "Título local", "no pisa títulos");
    }

    #[cfg(windows)]
    #[test]
    fn un_archivo_que_es_un_enlace_simbolico_se_rechaza() {
        let dir = carpeta(&[("destino", b"{}")]);
        if std::os::windows::fs::symlink_file(dir.join("destino"), dir.join(HISTORY)).is_err() {
            // Sin privilegio para crear enlaces: no se puede probar aquí.
            borrar(&dir);
            return;
        }
        let err = leer_carpeta(&dir).unwrap_err().to_string();
        borrar(&dir);
        assert!(err.starts_with("history:") && err.contains("enlace"), "{err}");
    }

    #[test]
    fn reemplazar_solo_los_favs_no_toca_el_historial_ni_siguiendo() {
        let (conn, ruta) = base_en_disco();
        sembrar(&conn);
        let c = leida(&[(FAVS, json(&favorita(2, "Nueva")))]);
        let r = aplicar(&conn, &c, Modo::Reemplazar).unwrap();
        assert_eq!((r.historial, r.siguiendo), (None, None));
        assert_eq!(categoria_de(&conn, 1), None, "favoritos se vació");
        assert_eq!(categoria_de(&conn, 2), Some(Some("Nueva".into())));
        assert_eq!(estado_de(&conn, 1), Some(1), "sin following no se toca siguiendo");
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "sin history no se toca el historial");
        assert_eq!(contar(&conn, "anime"), 2);
        assert_eq!(copias(&ruta).len(), 1);
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn reemplazar_los_tres_vacia_las_tres_tablas_pero_no_anime() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        let c = leida(&[
            (HISTORY, json(&visto(2, "1.0", 300))),
            (FOLLOWING, json(&seguida(2, 2))),
            (FAVS, json(&favorita(2, "Nueva"))),
        ]);
        aplicar_interno(&conn, &c, Modo::Reemplazar, false).unwrap();
        assert_eq!((visto_en(&conn, 1, 1.0), visto_en(&conn, 2, 1.0)), (None, Some(300)));
        assert_eq!((estado_de(&conn, 1), estado_de(&conn, 2)), (None, Some(2)));
        assert_eq!(categoria_de(&conn, 1), None);
        assert_eq!(contar(&conn, "anime"), 2, "nunca DELETE FROM anime");
    }

    #[test]
    fn un_fallo_en_los_favs_deshace_los_otros_dos_archivos() {
        let conn = abrir_en_memoria().unwrap();
        sembrar(&conn);
        conn.execute_batch("DROP TABLE favoritos").unwrap();
        let c = leida(&[
            (HISTORY, json(&visto(2, "1.0", 1))),
            (FOLLOWING, json(&seguida(2, 2))),
            (FAVS, json(&favorita(2, "X"))),
        ]);
        assert!(aplicar_interno(&conn, &c, Modo::Reemplazar, false).is_err());
        assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "el historial se deshizo");
        assert_eq!(estado_de(&conn, 1), Some(1), "siguiendo se deshizo");
        assert_eq!(estado_de(&conn, 2), None);
    }
}
