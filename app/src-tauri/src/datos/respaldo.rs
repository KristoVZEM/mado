//! Copias de seguridad de la base: exportar a un archivo que elige el usuario y respaldos automáticos con poda.

use super::{Error, Resultado, VERSION, configurar, migrar};
use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Cuántos respaldos automáticos se conservan; al crear uno nuevo se borran los más antiguos.
pub const CONSERVAR: usize = 5;

/// Nombre de la copia que se hace de los datos actuales justo antes de restaurar otra: la red de seguridad.
pub const COPIA_PREVIA: &str = "antes-de-restaurar.db";

/// Tablas que tiene que traer un archivo para considerarlo una copia de esta app.
const TABLAS_ESPERADAS: &[&str] = &["anime", "progreso", "historial", "ajustes", "siguiendo", "favoritos"];

const PREFIJO: &str = "mado-";
/// Prefijo que usaban los respaldos automáticos antes del cambio de nombre: se siguen podando, no se vuelven a crear.
const PREFIJO_ANTIGUO: &str = "ukiku-";
const SUFIJO: &str = ".db";

fn invalido<T>(mensaje: impl Into<String>) -> Resultado<T> {
    Err(Error::Invalido(mensaje.into()))
}

/// `AAAA-MM-DD`: la fecha que lleva el nombre de un respaldo automático. Solo cifras y guiones, así el nombre no
/// puede salirse de la carpeta de respaldos.
pub fn etiqueta_valida(etiqueta: &str) -> bool {
    let b = etiqueta.as_bytes();
    b.len() == 10 && b.iter().enumerate().all(|(i, c)| if i == 4 || i == 7 { *c == b'-' } else { c.is_ascii_digit() })
}

/// Comprueba el destino de una exportación: ruta absoluta, terminada en `.db`, en una carpeta que existe y que no
/// sea el propio archivo de la base en uso (`base`).
pub fn validar_destino(destino: &Path, base: &Path) -> Resultado<()> {
    if !destino.is_absolute() {
        return invalido("La ruta de la copia no es válida.");
    }
    let es_db = destino.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("db"));
    if !es_db {
        return invalido("El archivo de la copia debe terminar en .db.");
    }
    let Some(carpeta) = destino.parent().filter(|p| p.is_dir()) else {
        return invalido("La carpeta elegida no existe.");
    };
    let misma_carpeta = carpeta.canonicalize().ok() == base.parent().and_then(|p| p.canonicalize().ok());
    let mismo_nombre = match (destino.file_name().and_then(|n| n.to_str()), base.file_name().and_then(|n| n.to_str())) {
        (Some(a), Some(b)) => a.eq_ignore_ascii_case(b),
        _ => false,
    };
    if misma_carpeta && mismo_nombre {
        return invalido("No se puede escribir la copia encima de la base en uso. Elige otro nombre u otra carpeta.");
    }
    Ok(())
}

/// Escribe una copia consistente de la base en `destino` (con `VACUUM INTO`). Se escribe en un archivo temporal y
/// solo al terminar sustituye al destino, así una copia a medias nunca pisa una buena.
fn volcar(conn: &Connection, destino: &Path) -> Resultado<()> {
    let mut temporal = destino.as_os_str().to_owned();
    temporal.push(".tmp");
    let temporal = PathBuf::from(temporal);
    if temporal.exists() {
        std::fs::remove_file(&temporal)?;
    }
    let hecho = conn
        .execute("VACUUM INTO ?1", [temporal.to_string_lossy().as_ref()])
        .map_err(Error::from)
        .and_then(|_| std::fs::rename(&temporal, destino).map_err(Error::from));
    if hecho.is_err() {
        let _ = std::fs::remove_file(&temporal);
    }
    hecho
}

/// Exporta la base al archivo elegido por el usuario.
pub fn exportar(conn: &Connection, destino: &Path, base: &Path) -> Resultado<()> {
    validar_destino(destino, base)?;
    volcar(conn, destino)
}

/// Borra los respaldos automáticos más antiguos hasta dejar `conservar`. Solo toca archivos con el nombre exacto
/// `mado-AAAA-MM-DD.db` (o `ukiku-AAAA-MM-DD.db`, de antes del cambio de nombre); lo demás que haya en la carpeta no se mira. Devuelve cuántos borró.
pub fn podar(carpeta: &Path, conservar: usize) -> Resultado<usize> {
    let mut nombres: Vec<String> = std::fs::read_dir(carpeta)?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| {
            [PREFIJO, PREFIJO_ANTIGUO]
                .iter()
                .any(|p| n.strip_prefix(p).and_then(|r| r.strip_suffix(SUFIJO)).is_some_and(etiqueta_valida))
        })
        .collect();
    // Por fecha, no por nombre completo: con dos prefijos el nombre mezclaría los de antes y los de después.
    nombres.sort_by_key(|n| n.split_once('-').map(|(_, r)| r.to_string()).unwrap_or_default());
    let sobran = nombres.len().saturating_sub(conservar);
    let mut borrados = 0;
    for nombre in nombres.iter().take(sobran) {
        match std::fs::remove_file(carpeta.join(nombre)) {
            Ok(()) => borrados += 1,
            Err(e) => log::warn!("[datos] no se pudo borrar el respaldo antiguo {nombre}: {e}"),
        }
    }
    Ok(borrados)
}

/// Crea el respaldo automático del día `etiqueta` en `carpeta` (que se crea si falta) y poda los antiguos. Si ya hay
/// uno de ese día lo sustituye. Devuelve la ruta del archivo.
pub fn crear_respaldo(conn: &Connection, carpeta: &Path, etiqueta: &str) -> Resultado<PathBuf> {
    if !etiqueta_valida(etiqueta) {
        return invalido("La fecha del respaldo no es válida.");
    }
    std::fs::create_dir_all(carpeta)?;
    let destino = carpeta.join(format!("{PREFIJO}{etiqueta}{SUFIJO}"));
    volcar(conn, &destino)?;
    podar(carpeta, CONSERVAR)?;
    Ok(destino)
}

/// Comprueba que `origen` sea una copia restaurable y devuelve su conexión de solo lectura: un archivo `.db` que
/// existe, que no sea la base en uso, que SQLite lo dé por íntegro, de una versión de esquema que esta app conoce
/// y con las tablas de la app.
fn abrir_origen(origen: &Path, base: &Path) -> Resultado<Connection> {
    if !origen.is_absolute() {
        return invalido("La ruta de la copia no es válida.");
    }
    let es_db = origen.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("db"));
    if !es_db || !origen.is_file() {
        return invalido("Elige un archivo .db que exista.");
    }
    if let (Ok(a), Ok(b)) = (origen.canonicalize(), base.canonicalize())
        && a == b
    {
        return invalido("Ese es el archivo de datos en uso. Elige una copia.");
    }
    let no_es_copia = || Error::Invalido("Ese archivo no parece una copia de Mado.".into());
    let src = Connection::open_with_flags(origen, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_| no_es_copia())?;
    let integra: String = src.query_row("PRAGMA quick_check", [], |f| f.get(0)).map_err(|_| no_es_copia())?;
    if integra != "ok" {
        return invalido("La copia está dañada y no se puede restaurar.");
    }
    let version: u32 = src.query_row("PRAGMA user_version", [], |f| f.get(0)).map_err(|_| no_es_copia())?;
    if version > VERSION {
        return Err(Error::BaseMasNueva { encontrada: version, conocida: VERSION });
    }
    for tabla in TABLAS_ESPERADAS {
        let hay: i64 = src
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1", [tabla], |f| f.get(0))
            .map_err(|_| no_es_copia())?;
        if hay == 0 {
            return Err(no_es_copia());
        }
    }
    Ok(src)
}

/// Copia todo el contenido de `desde` sobre `conn` (la conexión en uso) con la API de copia de SQLite: la base se
/// sustituye de golpe y la conexión sigue valiendo.
fn volcar_sobre(desde: &Connection, conn: &mut Connection) -> Resultado<()> {
    let copia = Backup::new(desde, conn)?;
    copia.run_to_completion(256, Duration::from_millis(0), None)?;
    Ok(())
}

/// Sustituye los datos actuales por los de la copia `origen`. Antes guarda los actuales en
/// `carpeta_previa/antes-de-restaurar.db`; si algo falla después de empezar, los vuelve a poner. Una copia de una
/// versión anterior se migra al terminar. Devuelve la ruta de la copia previa.
pub fn restaurar(conn: &mut Connection, origen: &Path, base: &Path, carpeta_previa: &Path) -> Resultado<PathBuf> {
    let src = abrir_origen(origen, base)?;
    std::fs::create_dir_all(carpeta_previa)?;
    let previa = carpeta_previa.join(COPIA_PREVIA);
    volcar(conn, &previa)?;
    let aplicado = volcar_sobre(&src, conn)
        .and_then(|_| configurar(conn))
        .and_then(|_| migrar(conn));
    if let Err(e) = aplicado {
        // Los datos de antes siguen en `previa`: se devuelven a su sitio.
        let vuelta = Connection::open_with_flags(&previa, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(Error::from)
            .and_then(|p| volcar_sobre(&p, conn))
            .and_then(|_| configurar(conn));
        if let Err(v) = vuelta {
            log::warn!("[datos] no se pudo deshacer la restauración: {v}");
        }
        return Err(e);
    }
    Ok(previa)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Carpeta nueva y vacía dentro de la temporal del sistema.
    fn carpeta(nombre: &str) -> PathBuf {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let p = std::env::temp_dir().join(format!("mado-prueba-{nombre}-{}-{nanos}", std::process::id()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn base_con_dato(valor: &str) -> Connection {
        let conn = abrir_en_memoria().unwrap();
        conn.execute("INSERT INTO ajustes (clave, valor) VALUES ('volumen', ?1)", [valor]).unwrap();
        conn
    }

    fn leer_volumen(ruta: &Path) -> String {
        let c = Connection::open(ruta).unwrap();
        c.query_row("SELECT valor FROM ajustes WHERE clave = 'volumen'", [], |f| f.get(0)).unwrap()
    }

    #[test]
    fn las_etiquetas_son_fechas_y_nada_mas() {
        assert!(etiqueta_valida("2026-11-10"));
        for mala in ["", "2026-11-1", "2026/11/10", "../../a", "2026-11-10x", "abcd-ef-gh", "2026-11-10\n", "２０２６-11-10"] {
            assert!(!etiqueta_valida(mala), "{mala:?}");
        }
    }

    #[test]
    fn exportar_deja_una_copia_con_los_datos() {
        let dir = carpeta("exportar");
        let destino = dir.join("mi copia.db");
        exportar(&base_con_dato("42"), &destino, &dir.join("mado.db")).unwrap();
        assert_eq!(leer_volumen(&destino), "42");
        assert!(!dir.join("mi copia.db.tmp").exists(), "no queda el temporal");
    }

    #[test]
    fn exportar_sustituye_una_copia_anterior() {
        let dir = carpeta("sustituir");
        let destino = dir.join("copia.db");
        let base = dir.join("mado.db");
        exportar(&base_con_dato("1"), &destino, &base).unwrap();
        exportar(&base_con_dato("2"), &destino, &base).unwrap();
        assert_eq!(leer_volumen(&destino), "2");
    }

    #[test]
    fn el_destino_se_valida_antes_de_escribir() {
        let dir = carpeta("validar");
        let base = dir.join("mado.db");
        let conn = base_con_dato("1");
        let casos = [
            (PathBuf::from("copia.db"), "relativa"),
            (dir.join("copia.txt"), "extensión"),
            (dir.join("copia"), "sin extensión"),
            (dir.join("no existe").join("copia.db"), "carpeta inexistente"),
            (base.clone(), "la base en uso"),
            (dir.join("MADO.DB"), "la base en uso con otras mayúsculas"),
        ];
        for (destino, motivo) in casos {
            let r = exportar(&conn, &destino, &base);
            assert!(matches!(r, Err(Error::Invalido(_))), "{motivo}: {r:?}");
        }
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0, "no se escribió nada");
    }

    #[test]
    fn el_mismo_nombre_en_otra_carpeta_si_vale() {
        let dir = carpeta("otra");
        let otra = carpeta("otra-b");
        let base = dir.join("mado.db");
        exportar(&base_con_dato("7"), &otra.join("mado.db"), &base).unwrap();
        assert_eq!(leer_volumen(&otra.join("mado.db")), "7");
    }

    #[test]
    fn el_respaldo_lleva_la_fecha_en_el_nombre() {
        let dir = carpeta("respaldo");
        let ruta = crear_respaldo(&base_con_dato("9"), &dir.join("copias"), "2026-11-10").unwrap();
        assert_eq!(ruta.file_name().unwrap(), "mado-2026-11-10.db");
        assert_eq!(leer_volumen(&ruta), "9");
    }

    #[test]
    fn el_respaldo_rechaza_etiquetas_que_se_salen_de_la_carpeta() {
        let dir = carpeta("etiqueta");
        let conn = base_con_dato("1");
        for mala in ["../x", "2026-11-1", ""] {
            assert!(matches!(crear_respaldo(&conn, &dir, mala), Err(Error::Invalido(_))), "{mala:?}");
        }
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn solo_se_conservan_los_cinco_respaldos_mas_recientes() {
        let dir = carpeta("poda");
        let conn = base_con_dato("1");
        for dia in 1..=7 {
            crear_respaldo(&conn, &dir, &format!("2026-11-0{dia}")).unwrap();
        }
        let mut quedan: Vec<String> =
            std::fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name().into_string().unwrap()).collect();
        quedan.sort();
        let esperados: Vec<String> = (3..=7).map(|d| format!("mado-2026-11-0{d}.db")).collect();
        assert_eq!(quedan, esperados);
    }

    #[test]
    fn la_poda_no_toca_lo_que_no_es_un_respaldo() {
        let dir = carpeta("ajenos");
        for nombre in ["notas.txt", "mado-abc.db", "mado-2026-11-10.db.tmp", "mado.db", "mado-2026-11-10.db.v1.bak"] {
            std::fs::write(dir.join(nombre), "x").unwrap();
        }
        std::fs::create_dir(dir.join("mado-2026-01-01.db")).unwrap(); // una carpeta con nombre de respaldo
        for dia in 1..=3 {
            std::fs::write(dir.join(format!("mado-2026-10-0{dia}.db")), "x").unwrap();
        }
        assert_eq!(podar(&dir, 1).unwrap(), 2);
        for nombre in ["notas.txt", "mado-abc.db", "mado-2026-11-10.db.tmp", "mado.db", "mado-2026-11-10.db.v1.bak", "mado-2026-10-03.db"] {
            assert!(dir.join(nombre).exists(), "{nombre} debía quedarse");
        }
        assert!(dir.join("mado-2026-01-01.db").is_dir());
    }

    // --- restaurar ---

    /// Escribe en `ruta` una copia de una base con el volumen dado.
    fn copia_con_volumen(ruta: &Path, valor: &str) {
        volcar(&base_con_dato(valor), ruta).unwrap();
    }

    fn volumen_vivo(conn: &Connection) -> Option<String> {
        conn.query_row("SELECT valor FROM ajustes WHERE clave = 'volumen'", [], |f| f.get(0)).ok()
    }

    #[test]
    fn restaurar_sustituye_los_datos_y_guarda_los_de_antes() {
        let dir = carpeta("restaurar");
        let copia = dir.join("copia.db");
        copia_con_volumen(&copia, "2");
        let mut vivo = base_con_dato("1");
        vivo.execute("INSERT INTO anime (aid, slug, titulo) VALUES (7, 'x', 'Solo en la actual')", []).unwrap();

        let previa = restaurar(&mut vivo, &copia, &dir.join("mado.db"), &dir.join("copias")).unwrap();

        assert_eq!(volumen_vivo(&vivo).as_deref(), Some("2"));
        let animes: i64 = vivo.query_row("SELECT COUNT(*) FROM anime", [], |f| f.get(0)).unwrap();
        assert_eq!(animes, 0, "lo que solo había en la actual desaparece");
        assert_eq!(previa.file_name().unwrap(), COPIA_PREVIA);
        assert_eq!(leer_volumen(&previa), "1", "la copia previa trae los datos de antes");
        // La conexión sigue sirviendo para escribir.
        vivo.execute("UPDATE ajustes SET valor = '3' WHERE clave = 'volumen'", []).unwrap();
        assert_eq!(volumen_vivo(&vivo).as_deref(), Some("3"));
    }

    #[test]
    fn restaurar_rechaza_lo_que_no_es_una_copia_y_no_toca_nada() {
        let dir = carpeta("rechazar");
        let base = dir.join("mado.db");
        let mut vivo = base_con_dato("1");

        // Un archivo que no es SQLite.
        let texto = dir.join("texto.db");
        std::fs::write(&texto, "esto no es una base de datos").unwrap();
        // Una base SQLite de otra cosa.
        let ajena = dir.join("ajena.db");
        Connection::open(&ajena).unwrap().execute_batch("CREATE TABLE cosas (x); PRAGMA user_version = 1;").unwrap();
        // Una copia de una versión más nueva.
        let nueva = dir.join("nueva.db");
        copia_con_volumen(&nueva, "9");
        Connection::open(&nueva).unwrap().execute_batch("PRAGMA user_version = 999;").unwrap();
        // Rutas que no valen.
        let casos: Vec<(PathBuf, &str)> = vec![
            (texto, "no es SQLite"),
            (ajena, "sin las tablas de la app"),
            (nueva, "de una versión más nueva"),
            (dir.join("no existe.db"), "no existe"),
            (dir.join("copia.txt"), "extensión"),
            (PathBuf::from("relativa.db"), "relativa"),
        ];
        for (origen, motivo) in casos {
            let r = restaurar(&mut vivo, &origen, &base, &dir.join("copias"));
            assert!(matches!(r, Err(Error::Invalido(_)) | Err(Error::BaseMasNueva { .. })), "{motivo}: {r:?}");
        }
        assert_eq!(volumen_vivo(&vivo).as_deref(), Some("1"), "los datos siguen igual");
        assert!(!dir.join("copias").exists(), "sin copia previa: no se llegó a tocar nada");
    }

    #[test]
    fn restaurar_no_acepta_el_archivo_en_uso() {
        let dir = carpeta("en-uso");
        let base = dir.join("mado.db");
        copia_con_volumen(&base, "5");
        let mut vivo = base_con_dato("1");
        let r = restaurar(&mut vivo, &base, &base, &dir.join("copias"));
        assert!(matches!(r, Err(Error::Invalido(_))), "{r:?}");
    }

    #[test]
    fn una_copia_de_una_version_anterior_se_migra_al_restaurarla() {
        let dir = carpeta("anterior");
        let vieja = dir.join("vieja.db");
        {
            let c = Connection::open(&vieja).unwrap();
            let hasta = crate::datos::MIGRACIONES.len() - 1;
            for (i, sql) in crate::datos::MIGRACIONES.iter().take(hasta).enumerate() {
                c.execute_batch(sql).unwrap();
                c.execute_batch(&format!("PRAGMA user_version = {};", i + 1)).unwrap();
            }
            c.execute("INSERT INTO ajustes (clave, valor) VALUES ('volumen', '8')", []).unwrap();
        }
        let mut vivo = base_con_dato("1");
        restaurar(&mut vivo, &vieja, &dir.join("mado.db"), &dir.join("copias")).unwrap();
        assert_eq!(volumen_vivo(&vivo).as_deref(), Some("8"));
        let version: u32 = vivo.query_row("PRAGMA user_version", [], |f| f.get(0)).unwrap();
        assert_eq!(version, VERSION, "se migró hasta la versión actual");
        vivo.execute("SELECT duracion FROM anilist_media LIMIT 1", []).ok(); // la columna de la versión 8 existe
        vivo.prepare("SELECT duracion FROM anilist_media").unwrap();
    }

    #[test]
    fn si_la_migracion_falla_vuelven_los_datos_de_antes() {
        let dir = carpeta("deshacer");
        // Una copia que dice ser de la versión anterior pero ya trae la columna que añade la última migración:
        // al migrarla falla.
        let rota = dir.join("rota.db");
        copia_con_volumen(&rota, "7");
        Connection::open(&rota).unwrap().execute_batch(&format!("PRAGMA user_version = {};", VERSION - 1)).unwrap();
        let mut vivo = base_con_dato("1");
        let r = restaurar(&mut vivo, &rota, &dir.join("mado.db"), &dir.join("copias"));
        assert!(r.is_err(), "la migración debía fallar");
        assert_eq!(volumen_vivo(&vivo).as_deref(), Some("1"), "los datos de antes volvieron");
        let version: u32 = vivo.query_row("PRAGMA user_version", [], |f| f.get(0)).unwrap();
        assert_eq!(version, VERSION);
    }

    #[test]
    fn la_poda_tambien_cuenta_los_respaldos_con_el_prefijo_antiguo() {
        let dir = carpeta("poda-antigua");
        for dia in 1..=4 {
            std::fs::write(dir.join(format!("ukiku-2026-10-0{dia}.db")), "x").unwrap();
        }
        for dia in 5..=7 {
            std::fs::write(dir.join(format!("mado-2026-10-0{dia}.db")), "x").unwrap();
        }
        assert_eq!(podar(&dir, 5).unwrap(), 2);
        assert!(!dir.join("ukiku-2026-10-01.db").exists() && !dir.join("ukiku-2026-10-02.db").exists());
        assert!(dir.join("ukiku-2026-10-03.db").exists() && dir.join("mado-2026-10-07.db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
