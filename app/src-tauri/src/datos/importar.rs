//! Importación del historial de Ukiku: el archivo `history` de su copia de seguridad (JSON versión 2).
//! Este módulo lee, valida y aplica; la interfaz solo le pasa la ruta que devuelve el diálogo nativo.

use super::progreso::MAX_TEXTO;
use super::{Error, Resultado};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};

/// Tope de tamaño del archivo. El real pesa unos 275 KB para 2000 episodios; 20 MiB admite ~150 000.
pub const MAX_BYTES: u64 = 20 * 1024 * 1024;
const VERSION_COPIA: i64 = 2;

/// Un episodio visto, ya validado. `fecha` son milisegundos, como `historial.visto_en`.
#[derive(Debug, Clone, PartialEq)]
pub struct Registro {
    pub aid: i64,
    pub eid: Option<i64>,
    pub nombre: String,
    pub slug: String,
    pub numero: f64,
    pub fecha: i64,
}

#[derive(Debug)]
pub struct Lectura {
    pub registros: Vec<Registro>,
    pub invalidos: u32,
}

/// Texto no vacío (tras recortar) y de longitud acotada.
fn texto(v: Option<&Value>) -> Option<String> {
    let s = v?.as_str()?.trim();
    if s.is_empty() || s.len() > MAX_TEXTO { None } else { Some(s.to_string()) }
}

/// Valida un registro de `data`; `None` si algún campo no sirve (el llamador lo cuenta como inválido).
fn registro(v: &Value) -> Option<Registro> {
    let aid = v.get("aid")?.as_i64().filter(|a| *a > 0)?;
    let numero = v.get("number")?.as_f64().filter(|n| n.is_finite() && *n >= 0.0)?;
    let fecha = v.get("date")?.as_i64().filter(|d| *d >= 0)?;
    let eid = match v.get("eid") {
        None | Some(Value::Null) => None,
        Some(e) => Some(e.as_i64()?),
    };
    // `+ 0.0` normaliza -0.0 a 0.0 para que la clave de duplicados y la comparación en SQL coincidan.
    Some(Registro { aid, eid, nombre: texto(v.get("name"))?, slug: texto(v.get("slug"))?, numero: numero + 0.0, fecha })
}

pub fn parsear(contenido: &str) -> Resultado<Lectura> {
    let raiz: Value = serde_json::from_str(contenido)
        .map_err(|_| Error::Invalido("el archivo no es un JSON válido".into()))?;
    match raiz.get("version").and_then(Value::as_i64) {
        Some(VERSION_COPIA) => {}
        Some(otra) => {
            return Err(Error::Invalido(format!("versión de copia no soportada: {otra} (se espera {VERSION_COPIA})")));
        }
        None => {
            return Err(Error::Invalido("el archivo no parece un historial de Ukiku (falta la versión)".into()));
        }
    }
    let datos = raiz
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| Error::Invalido("el archivo no trae la lista de episodios".into()))?;

    let mut por_clave: HashMap<(i64, u64), Registro> = HashMap::new();
    let mut invalidos = 0u32;
    for v in datos {
        let Some(r) = registro(v) else {
            invalidos += 1;
            continue;
        };
        let clave = (r.aid, r.numero.to_bits());
        if por_clave.get(&clave).is_none_or(|previo| r.fecha > previo.fecha) {
            por_clave.insert(clave, r);
        }
    }
    if por_clave.is_empty() {
        return Err(Error::Invalido("el archivo no tiene ningún episodio válido".into()));
    }
    let mut registros: Vec<Registro> = por_clave.into_values().collect();
    registros.sort_by(|a, b| a.aid.cmp(&b.aid).then(a.numero.total_cmp(&b.numero)));
    Ok(Lectura { registros, invalidos })
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

/// Lee el archivo con tope de tamaño (lee a lo sumo `MAX_BYTES + 1` bytes) y lo valida. Solo acepta
/// rutas absolutas de disco local: la que devuelve el diálogo nativo.
pub fn leer_archivo(ruta: &Path) -> Resultado<Lectura> {
    if !ruta.is_absolute() {
        return Err(Error::Invalido("la ruta del archivo debe ser absoluta".into()));
    }
    if !es_ruta_de_disco(ruta) {
        return Err(Error::Invalido("no se admiten rutas de red ni de dispositivo".into()));
    }
    if !std::fs::metadata(ruta)?.is_file() {
        return Err(Error::Invalido("la ruta no es un archivo".into()));
    }
    let mut bytes = Vec::new();
    std::fs::File::open(ruta)?.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(Error::Invalido("el archivo es demasiado grande para ser un historial de Ukiku".into()));
    }
    let contenido = String::from_utf8(bytes)
        .map_err(|_| Error::Invalido("el archivo no es texto (UTF-8)".into()))?;
    parsear(&contenido)
}

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumen {
    pub total: u32,
    pub series: u32,
    pub nuevos: u32,
    pub existentes: u32,
    pub invalidos: u32,
    pub actuales: u32,
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

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aplicado {
    pub nuevos: u32,
    pub actualizados: u32,
    pub invalidos: u32,
    pub copia: Option<String>,
}

fn existe(conn: &Connection, aid: i64, numero: f64) -> Resultado<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM historial WHERE aid = ?1 AND numero = ?2)",
        params![aid, numero],
        |f| f.get(0),
    )?)
}

/// Lo que pasaría al importar, sin escribir nada.
pub fn previsualizar(conn: &Connection, l: &Lectura) -> Resultado<Resumen> {
    let mut nuevos = 0u32;
    let mut series = HashSet::new();
    for r in &l.registros {
        series.insert(r.aid);
        if !existe(conn, r.aid, r.numero)? {
            nuevos += 1;
        }
    }
    let total = l.registros.len() as u32;
    let actuales: u32 = conn.query_row("SELECT COUNT(*) FROM historial", [], |f| f.get(0))?;
    Ok(Resumen { total, series: series.len() as u32, nuevos, existentes: total - nuevos, invalidos: l.invalidos, actuales })
}

/// Copia de la base antes de reemplazar: `ukiku.db` -> `ukiku.db.reemplazo-<ms>.bak`. Cada
/// reemplazo deja su propia copia (nunca se pisa una anterior); se escribe en un `.tmp` y se
/// renombra al terminar. `None` si la base no está en disco.
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

/// Aplica la lectura en una sola transacción: si algo falla no queda nada a medias. Reemplazar
/// exige una copia previa de la base en disco; sin ella no se toca nada.
pub fn aplicar(conn: &Connection, l: &Lectura, modo: Modo) -> Resultado<Aplicado> {
    aplicar_interno(conn, l, modo, true)
}

fn aplicar_interno(conn: &Connection, l: &Lectura, modo: Modo, exigir_copia: bool) -> Resultado<Aplicado> {
    // VACUUM INTO no puede ir dentro de una transacción.
    let copia = if modo == Modo::Reemplazar { copia_previa(conn)? } else { None };
    if modo == Modo::Reemplazar && exigir_copia && copia.is_none() {
        return Err(Error::Invalido("no se pudo preparar la copia previa de la base; no se reemplaza nada".into()));
    }
    let tx = conn.unchecked_transaction()?;
    if modo == Modo::Reemplazar {
        // Solo el historial: borrar `anime` arrastraría el progreso por el ON DELETE CASCADE.
        tx.execute("DELETE FROM historial", [])?;
    }
    let (mut nuevos, mut actualizados) = (0u32, 0u32);
    for r in &l.registros {
        tx.execute(
            "INSERT INTO anime (aid, slug, titulo) VALUES (?1, ?2, ?3) ON CONFLICT(aid) DO NOTHING",
            params![r.aid, r.slug, r.nombre],
        )?;
        if existe(&tx, r.aid, r.numero)? {
            actualizados += 1;
        } else {
            nuevos += 1;
        }
        tx.execute(
            "INSERT INTO historial (aid, numero, visto_en, eid) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(aid, numero) DO UPDATE SET
                 visto_en = MAX(visto_en, excluded.visto_en),
                 eid = COALESCE(eid, excluded.eid)",
            params![r.aid, r.numero, r.fecha, r.eid],
        )?;
        // Lo importado ya está visto: sin esto "Continuar viendo" ofrecería episodios terminados.
        tx.execute("DELETE FROM progreso WHERE aid = ?1 AND numero = ?2", params![r.aid, r.numero])?;
    }
    tx.commit()?;
    Ok(Aplicado { nuevos, actualizados, invalidos: l.invalidos, copia: copia.map(|p| p.to_string_lossy().into_owned()) })
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::progreso::{guardar_progreso, marcar_visto, Serie};
    use crate::datos::{abrir, abrir_en_memoria};

    fn json(registros: &str) -> String {
        format!(r#"{{"version":2,"date":"08/11/2026 18:22","data":[{registros}]}}"#)
    }

    fn rec(aid: i64, eid: i64, numero: &str, fecha: i64) -> String {
        format!(r#"{{"aid":{aid},"date":{fecha},"eid":{eid},"name":"Serie {aid}","number":{numero},"slug":"serie-{aid}"}}"#)
    }

    fn archivo(nombre: &str, contenido: &[u8]) -> PathBuf {
        let unico = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let ruta = std::env::temp_dir().join(format!("ukiku-importar-{}-{unico}-{nombre}", std::process::id()));
        std::fs::write(&ruta, contenido).unwrap();
        ruta
    }

    #[test]
    fn parsea_un_historial_valido() {
        let l = parsear(&json(&format!("{},{}", rec(1, 10, "1.0", 1000), rec(1, 11, "2.5", 2000)))).unwrap();
        assert_eq!(l.invalidos, 0);
        assert_eq!(l.registros.len(), 2);
        assert_eq!(
            l.registros[1],
            Registro { aid: 1, eid: Some(11), nombre: "Serie 1".into(), slug: "serie-1".into(), numero: 2.5, fecha: 2000 }
        );
    }

    #[test]
    fn rechaza_otra_version_o_ninguna() {
        let otra = parsear(r#"{"version":3,"data":[]}"#).unwrap_err().to_string();
        assert!(otra.contains("3"), "{otra}");
        assert!(parsear(r#"{"data":[]}"#).is_err());
        assert!(parsear(r#"{"date":"x","data":[{"aid":1}]}"#).is_err());
    }

    #[test]
    fn rechaza_json_roto_y_archivo_sin_lista() {
        assert!(parsear("esto no es json").is_err());
        assert!(parsear(r#"{"version":2}"#).is_err());
        assert!(parsear(r#"{"version":2,"data":"no es lista"}"#).is_err());
    }

    #[test]
    fn omite_y_cuenta_los_registros_invalidos() {
        let largo = "x".repeat(MAX_TEXTO + 1);
        let malos = vec![
            r#"{"aid":0,"date":1,"eid":1,"name":"a","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"a","number":-1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":-5,"eid":1,"name":"a","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":"x","name":"a","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"  ","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"a","number":1.0,"slug":""}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"a","number":"uno","slug":"a"}"#.to_string(),
            format!(r#"{{"aid":1,"date":1,"eid":1,"name":"{largo}","number":1.0,"slug":"a"}}"#),
            "[]".to_string(),
        ];
        let l = parsear(&json(&format!("{},{}", rec(1, 1, "1.0", 1), malos.join(",")))).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.invalidos, 9);
    }

    #[test]
    fn un_archivo_sin_ningun_registro_valido_es_error() {
        assert!(parsear(&json("")).is_err());
        assert!(parsear(&json(r#"{"aid":0}"#)).is_err());
    }

    #[test]
    fn con_duplicados_se_queda_el_de_fecha_mas_reciente() {
        let l = parsear(&json(&format!("{},{},{}", rec(1, 10, "1.0", 500), rec(1, 99, "1", 900), rec(1, 11, "1.0", 700))))
            .unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!((l.registros[0].fecha, l.registros[0].eid), (900, Some(99)));
    }

    #[test]
    fn eid_ausente_o_nulo_es_valido() {
        let sin = r#"{"aid":1,"date":5,"name":"a","number":1.0,"slug":"a"}"#;
        let nulo = r#"{"aid":2,"date":5,"eid":null,"name":"a","number":1.0,"slug":"a"}"#;
        let l = parsear(&json(&format!("{sin},{nulo}"))).unwrap();
        assert_eq!(l.invalidos, 0);
        assert!(l.registros.iter().all(|r| r.eid.is_none()));
    }

    #[test]
    fn leer_archivo_lee_un_historial_en_disco() {
        let ruta = archivo("valido", json(&rec(7, 1, "3.0", 42)).as_bytes());
        let l = leer_archivo(&ruta).unwrap();
        std::fs::remove_file(&ruta).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.registros[0].aid, 7);
    }

    #[test]
    fn leer_archivo_rechaza_rutas_relativas_y_archivos_inexistentes() {
        assert!(leer_archivo(Path::new("history")).is_err());
        let falta = std::env::temp_dir().join("ukiku-importar-no-existe-jamas");
        assert!(leer_archivo(&falta).is_err());
    }

    #[test]
    fn leer_archivo_rechaza_rutas_de_red_y_de_dispositivo_con_cualquier_separador() {
        for ruta in [
            r"\\host\share\history",
            "//host/share/history",
            r"/\host\share\history",
            r"\\?\UNC\host\share\history",
            "//?/UNC/host/share/history",
            r"\\.\pipe\ukiku",
            "//./NUL",
        ] {
            let err = leer_archivo(Path::new(ruta)).unwrap_err().to_string();
            assert!(err.contains("red"), "{ruta}: {err}");
        }
    }

    #[test]
    fn leer_archivo_rechaza_directorios() {
        let dir = leer_archivo(&std::env::temp_dir());
        assert!(dir.unwrap_err().to_string().contains("no es un archivo"));
    }

    #[cfg(windows)]
    #[test]
    fn leer_archivo_acepta_una_ruta_de_disco_en_forma_verbatim() {
        let ruta = archivo("verbatim", json(&rec(8, 1, "1.0", 5)).as_bytes());
        let verbatim = PathBuf::from(format!(r"\\?\{}", ruta.display()));
        let l = leer_archivo(&verbatim).unwrap();
        std::fs::remove_file(&ruta).unwrap();
        assert_eq!(l.registros[0].aid, 8);
    }

    #[test]
    fn leer_archivo_rechaza_un_archivo_demasiado_grande() {
        let ruta = archivo("grande", &vec![b' '; MAX_BYTES as usize + 1]);
        let r = leer_archivo(&ruta);
        std::fs::remove_file(&ruta).unwrap();
        assert!(r.unwrap_err().to_string().contains("demasiado grande"));
    }

    #[test]
    fn leer_archivo_rechaza_bytes_que_no_son_texto() {
        let ruta = archivo("binario", &[0xff, 0xfe, 0x00, 0x80]);
        let r = leer_archivo(&ruta);
        std::fs::remove_file(&ruta).unwrap();
        assert!(r.is_err());
    }

    fn reg(aid: i64, numero: f64, fecha: i64, eid: Option<i64>) -> Registro {
        Registro { aid, eid, nombre: format!("Backup {aid}"), slug: format!("serie-{aid}"), numero, fecha }
    }

    fn lectura(registros: Vec<Registro>) -> Lectura {
        Lectura { registros, invalidos: 0 }
    }

    const ONE_PIECE: Serie<'static> = Serie { aid: 10, slug: "one-piece", titulo: "One Piece" };

    fn fila(conn: &Connection, aid: i64, numero: f64) -> Option<(i64, Option<i64>)> {
        conn.query_row("SELECT visto_en, eid FROM historial WHERE aid = ?1 AND numero = ?2", params![aid, numero], |f| {
            Ok((f.get(0)?, f.get(1)?))
        })
        .ok()
    }

    fn contar(conn: &Connection, tabla: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0)).unwrap()
    }

    #[test]
    fn previsualizar_cuenta_nuevos_existentes_series_y_actuales() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 7.0, None, &[]).unwrap();
        let mut l = lectura(vec![reg(10, 1.0, 100, None), reg(10, 2.0, 100, None), reg(20, 1.0, 100, None)]);
        l.invalidos = 4;
        let r = previsualizar(&conn, &l).unwrap();
        assert_eq!(r, Resumen { total: 3, series: 2, nuevos: 2, existentes: 1, invalidos: 4, actuales: 2 });
        assert_eq!(contar(&conn, "historial"), 2, "la vista previa no escribe");
    }

    #[test]
    fn el_modo_se_lee_de_un_texto_y_rechaza_otros() {
        assert_eq!(Modo::desde_texto("mezclar").unwrap(), Modo::Mezclar);
        assert_eq!(Modo::desde_texto("reemplazar").unwrap(), Modo::Reemplazar);
        assert!(Modo::desde_texto("borrar").is_err());
    }

    #[test]
    fn mezclar_agrega_los_nuevos_y_cuenta() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        let l = lectura(vec![reg(10, 1.0, 100, Some(1)), reg(10, 2.0, 200, Some(2)), reg(20, 1.0, 300, Some(3))]);
        let r = aplicar(&conn, &l, Modo::Mezclar).unwrap();
        assert_eq!((r.nuevos, r.actualizados, r.copia), (2, 1, None));
        assert_eq!(contar(&conn, "historial"), 3);
        assert_eq!(contar(&conn, "anime"), 2);
    }

    #[test]
    fn mezclar_conserva_la_fecha_mas_reciente() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 2.0, None, &[]).unwrap();
        aplicar(&conn, &lectura(vec![reg(10, 1.0, 9000, None), reg(10, 2.0, 100, None)]), Modo::Mezclar).unwrap();
        assert_eq!(fila(&conn, 10, 1.0).unwrap().0, 9000, "el archivo es más nuevo");
        assert_eq!(fila(&conn, 10, 2.0).unwrap().0, 5000, "lo local es más nuevo");
    }

    #[test]
    fn mezclar_rellena_el_eid_solo_si_faltaba() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        aplicar(&conn, &lectura(vec![reg(10, 1.0, 100, Some(7))]), Modo::Mezclar).unwrap();
        assert_eq!(fila(&conn, 10, 1.0).unwrap().1, Some(7));
        aplicar(&conn, &lectura(vec![reg(10, 1.0, 100, Some(8))]), Modo::Mezclar).unwrap();
        assert_eq!(fila(&conn, 10, 1.0).unwrap().1, Some(7), "un eid ya guardado no se pisa");
    }

    #[test]
    fn importar_no_pisa_el_titulo_de_una_serie_ya_conocida() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 5.0, 10.0, 1400.0).unwrap();
        aplicar(&conn, &lectura(vec![reg(10, 1.0, 100, None)]), Modo::Mezclar).unwrap();
        let titulo: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 10", [], |f| f.get(0)).unwrap();
        assert_eq!(titulo, "One Piece");
    }

    #[test]
    fn importar_borra_el_progreso_de_lo_importado_pero_no_el_de_otros_episodios() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, 100.0, 1400.0).unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 2.0, 100.0, 1400.0).unwrap();
        aplicar(&conn, &lectura(vec![reg(10, 1.0, 100, None)]), Modo::Mezclar).unwrap();
        assert_eq!(contar(&conn, "progreso"), 1);
        let queda: f64 = conn.query_row("SELECT numero FROM progreso", [], |f| f.get(0)).unwrap();
        assert_eq!(queda, 2.0);
    }

    #[test]
    fn reemplazar_vacia_el_historial_pero_conserva_las_series_y_el_progreso_ajeno() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 2.0, None, &[]).unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 3.0, 100.0, 1400.0).unwrap();
        let r = aplicar_interno(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), Modo::Reemplazar, false).unwrap();
        assert_eq!((r.nuevos, r.actualizados), (1, 0));
        assert_eq!(contar(&conn, "historial"), 1);
        assert!(fila(&conn, 10, 1.0).is_none());
        assert_eq!(contar(&conn, "anime"), 2, "las series de antes siguen en la base");
        assert_eq!(contar(&conn, "progreso"), 1, "el progreso de un episodio no importado sobrevive");
    }

    #[test]
    fn reemplazar_guarda_una_copia_previa_de_la_base_en_disco() {
        let unico = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let ruta = std::env::temp_dir().join(format!("ukiku-reemplazo-{}-{unico}.db", std::process::id()));
        let conn = abrir(&ruta).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        let r = aplicar(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), Modo::Reemplazar).unwrap();
        let copia = std::path::PathBuf::from(r.copia.expect("debe informar la copia"));
        assert!(copia.exists());
        let previa = Connection::open(&copia).unwrap();
        let de_serie = |aid: i64| -> i64 {
            previa.query_row("SELECT COUNT(*) FROM historial WHERE aid = ?1", [aid], |f| f.get(0)).unwrap()
        };
        assert_eq!(de_serie(10), 1, "la copia conserva el historial anterior");
        assert_eq!(de_serie(20), 0, "la copia es previa al reemplazo");
        drop(previa);
        drop(conn);
        for f in [copia, ruta.clone(), ruta.with_extension("db-wal"), ruta.with_extension("db-shm")] {
            let _ = std::fs::remove_file(f);
        }
    }

    fn base_en_disco() -> (Connection, PathBuf) {
        let unico = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let ruta = std::env::temp_dir().join(format!("ukiku-reemplazo-{}-{unico}.db", std::process::id()));
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

    fn filas_de(ruta: &Path, aid: i64) -> i64 {
        let c = Connection::open(ruta).unwrap();
        c.query_row("SELECT COUNT(*) FROM historial WHERE aid = ?1", [aid], |f| f.get(0)).unwrap()
    }

    #[test]
    fn dos_reemplazos_seguidos_dejan_dos_copias_distintas() {
        let (conn, ruta) = base_en_disco();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        let r1 = aplicar(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), Modo::Reemplazar).unwrap();
        let r2 = aplicar(&conn, &lectura(vec![reg(30, 1.0, 100, None)]), Modo::Reemplazar).unwrap();
        let (c1, c2) = (PathBuf::from(r1.copia.unwrap()), PathBuf::from(r2.copia.unwrap()));
        assert_ne!(c1, c2);
        assert_eq!(copias(&ruta).len(), 2);
        assert_eq!(filas_de(&c1, 10), 1, "la primera copia sigue con el historial original");
        assert_eq!(filas_de(&c1, 20), 0);
        assert_eq!(filas_de(&c2, 20), 1, "la segunda copia es previa al segundo reemplazo");
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn reemplazar_en_una_base_en_memoria_falla_sin_tocar_nada() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        let r = aplicar(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), Modo::Reemplazar);
        assert!(r.unwrap_err().to_string().contains("no se reemplaza nada"));
        assert_eq!(contar(&conn, "historial"), 1);
        assert!(fila(&conn, 10, 1.0).is_some());
    }

    #[test]
    fn si_la_copia_falla_no_se_borra_nada() {
        let (conn, ruta) = base_en_disco();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        let mut tmp = std::ffi::OsString::from(&ruta);
        tmp.push(".reemplazo.tmp");
        std::fs::create_dir(&tmp).unwrap();
        let r = aplicar(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), Modo::Reemplazar);
        assert!(r.is_err());
        assert_eq!(contar(&conn, "historial"), 1);
        assert!(fila(&conn, 10, 1.0).is_some());
        assert!(copias(&ruta).is_empty());
        drop(conn);
        limpiar(&ruta);
    }

    #[test]
    fn un_fallo_a_medias_no_deja_cambios() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        conn.execute_batch("DROP TABLE progreso").unwrap();
        let r = aplicar_interno(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), Modo::Reemplazar, false);
        assert!(r.is_err());
        assert_eq!(contar(&conn, "historial"), 1);
        assert!(fila(&conn, 10, 1.0).is_some(), "el DELETE del historial se deshizo");
        assert!(fila(&conn, 20, 1.0).is_none());
    }
}
