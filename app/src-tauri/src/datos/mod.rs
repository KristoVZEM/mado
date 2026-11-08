//! Capa de datos locales: SQLite con migraciones por `PRAGMA user_version`.
//! Toda la lógica son funciones sobre `&Connection`; los comandos de Tauri viven en `comandos`.

pub mod ajustes;
pub mod comandos;
pub mod progreso;

use rusqlite::Connection;
use std::fmt;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug)]
pub enum Error {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    /// Entrada rechazada por validación (mensaje apto para mostrar).
    Invalido(String),
    /// La base la creó una versión más nueva de la app: no se toca.
    BaseMasNueva { encontrada: u32, conocida: u32 },
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Sqlite(e) => write!(f, "error de la base de datos: {e}"),
            Error::Io(e) => write!(f, "error de disco: {e}"),
            Error::Invalido(m) => write!(f, "{m}"),
            Error::BaseMasNueva { encontrada, conocida } => write!(
                f,
                "los datos son de una versión más nueva de la app (esquema {encontrada}, esta app conoce hasta {conocida}); actualiza la app"
            ),
        }
    }
}

impl std::error::Error for Error {}

impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Error::Sqlite(e)
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}

pub type Resultado<T> = Result<T, Error>;

/// Esquema de la versión 1.
const V1: &str = "
CREATE TABLE anime (
    aid    INTEGER PRIMARY KEY,
    slug   TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL
);
CREATE TABLE progreso (
    aid         INTEGER NOT NULL REFERENCES anime(aid) ON DELETE CASCADE,
    numero      REAL    NOT NULL,
    posicion_s  REAL    NOT NULL,
    duracion_s  REAL    NOT NULL,
    actualizado INTEGER NOT NULL,
    PRIMARY KEY (aid, numero)
);
CREATE INDEX progreso_actualizado ON progreso(actualizado DESC);
CREATE TABLE historial (
    aid      INTEGER NOT NULL REFERENCES anime(aid) ON DELETE CASCADE,
    numero   REAL    NOT NULL,
    visto_en INTEGER NOT NULL,
    PRIMARY KEY (aid, numero)
);
CREATE TABLE ajustes (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
);
";

/// Migraciones en orden: la posición `i` lleva la base de la versión `i` a la `i + 1`.
const MIGRACIONES: &[&str] = &[V1];

/// Versión de esquema que conoce esta app.
pub const VERSION: u32 = MIGRACIONES.len() as u32;

fn version_actual(conn: &Connection) -> Resultado<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |f| f.get::<_, u32>(0))?)
}

/// Aplica las migraciones pendientes, cada una en su transacción. Si la base es de una versión más
/// nueva que `VERSION`, no hace nada y devuelve `BaseMasNueva`.
pub fn migrar(conn: &mut Connection) -> Resultado<()> {
    let actual = version_actual(conn)?;
    if actual > VERSION {
        return Err(Error::BaseMasNueva { encontrada: actual, conocida: VERSION });
    }
    for (i, sql) in MIGRACIONES.iter().enumerate().skip(actual as usize) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.execute_batch(&format!("PRAGMA user_version = {};", i + 1))?;
        tx.commit()?;
    }
    Ok(())
}

fn configurar(conn: &Connection) -> Resultado<()> {
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;",
    )?;
    Ok(())
}

/// Ruta de la copia previa a migrar desde `version`: `ukiku.db` -> `ukiku.db.v1.bak`.
fn ruta_copia(ruta: &Path, version: u32) -> PathBuf {
    let mut nombre = ruta.as_os_str().to_owned();
    nombre.push(format!(".v{version}.bak"));
    PathBuf::from(nombre)
}

/// Ruta donde se escribe la copia antes de renombrarla sobre `ruta_copia`.
fn ruta_copia_temporal(ruta: &Path, version: u32) -> PathBuf {
    let mut nombre = ruta_copia(ruta, version).into_os_string();
    nombre.push(".tmp");
    PathBuf::from(nombre)
}

/// Abre (o crea) la base en `ruta`, la configura y la migra. Si ya existía con datos y hay
/// migraciones pendientes, antes guarda una copia con `VACUUM INTO`.
pub fn abrir(ruta: &Path) -> Resultado<Connection> {
    let mut conn = Connection::open(ruta)?;
    // Antes de comprobar la versión no se escribe nada: cambiar a WAL reescribe la cabecera.
    conn.busy_timeout(Duration::from_secs(5))?;
    let actual = version_actual(&conn)?;
    if actual > VERSION {
        return Err(Error::BaseMasNueva { encontrada: actual, conocida: VERSION });
    }
    configurar(&conn)?;
    if actual > 0 && actual < VERSION {
        let copia = ruta_copia(ruta, actual);
        let temporal = ruta_copia_temporal(ruta, actual);
        if temporal.exists() {
            std::fs::remove_file(&temporal)?;
        }
        conn.execute("VACUUM INTO ?1", [temporal.to_string_lossy().as_ref()])?;
        // La copia anterior solo se sustituye cuando la nueva ya está completa.
        std::fs::rename(&temporal, &copia)?;
    }
    migrar(&mut conn)?;
    Ok(conn)
}

/// Base en memoria, ya migrada. Para las pruebas.
#[cfg(test)]
pub fn abrir_en_memoria() -> Resultado<Connection> {
    let mut conn = Connection::open_in_memory()?;
    configurar(&conn)?;
    migrar(&mut conn)?;
    Ok(conn)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn tablas(conn: &Connection) -> Vec<String> {
        let mut st = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap();
        st.query_map([], |f| f.get::<_, String>(0)).unwrap().map(|r| r.unwrap()).collect()
    }

    fn ruta_temporal(nombre: &str) -> PathBuf {
        let unico = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("ukiku-pruebas-{}-{unico}-{nombre}", std::process::id()))
    }

    #[test]
    fn una_base_nueva_queda_en_la_version_actual_con_sus_tablas() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
        assert_eq!(tablas(&conn), vec!["ajustes", "anime", "historial", "progreso"]);
    }

    #[test]
    fn migrar_dos_veces_no_falla_ni_cambia_la_version() {
        let mut conn = abrir_en_memoria().unwrap();
        migrar(&mut conn).unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
    }

    #[test]
    fn una_base_mas_nueva_no_se_toca() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA user_version = 99;").unwrap();
        let err = migrar(&mut conn).unwrap_err();
        assert!(matches!(err, Error::BaseMasNueva { encontrada: 99, conocida: VERSION }));
        assert!(tablas(&conn).is_empty(), "no debe crear tablas en una base más nueva");
    }

    #[test]
    fn las_claves_foraneas_estan_activas() {
        let conn = abrir_en_memoria().unwrap();
        let r = conn.execute(
            "INSERT INTO progreso (aid, numero, posicion_s, duracion_s, actualizado) VALUES (1, 1, 0, 0, 0)",
            [],
        );
        assert!(r.is_err(), "sin fila en anime, el progreso debe rechazarse");
    }

    #[test]
    fn abrir_en_disco_crea_el_archivo_y_la_segunda_apertura_conserva_los_datos() {
        let ruta = ruta_temporal("abrir.db");
        {
            let conn = abrir(&ruta).unwrap();
            conn.execute("INSERT INTO ajustes (clave, valor) VALUES ('volumen', '40')", []).unwrap();
        }
        let conn = abrir(&ruta).unwrap();
        let v: String = conn
            .query_row("SELECT valor FROM ajustes WHERE clave = 'volumen'", [], |f| f.get(0))
            .unwrap();
        assert_eq!(v, "40");
        drop(conn);
        for sufijo in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{sufijo}", ruta.display()));
        }
    }

    #[test]
    fn la_ruta_de_la_copia_lleva_la_version_de_origen() {
        let r = ruta_copia(Path::new("C:/datos/ukiku.db"), 1);
        assert_eq!(r, PathBuf::from("C:/datos/ukiku.db.v1.bak"));
    }

    #[test]
    fn la_ruta_temporal_de_la_copia_termina_en_tmp() {
        let r = ruta_copia_temporal(Path::new("C:/datos/ukiku.db"), 1);
        assert_eq!(r, PathBuf::from("C:/datos/ukiku.db.v1.bak.tmp"));
    }

    #[test]
    fn abrir_una_base_mas_nueva_no_modifica_el_archivo() {
        let ruta = ruta_temporal("nueva.db");
        {
            let conn = Connection::open(&ruta).unwrap();
            conn.execute_batch("PRAGMA user_version = 99;").unwrap();
        }
        let antes = std::fs::read(&ruta).unwrap();
        let err = abrir(&ruta).unwrap_err();
        assert!(matches!(err, Error::BaseMasNueva { encontrada: 99, conocida: VERSION }));
        let despues = std::fs::read(&ruta).unwrap();
        assert_eq!(antes[18..20], despues[18..20], "el modo de journal de la cabecera cambió");
        assert_eq!(antes, despues);
        for sufijo in ["-wal", "-shm"] {
            assert!(!Path::new(&format!("{}{sufijo}", ruta.display())).exists());
        }
        let _ = std::fs::remove_file(&ruta);
    }

    #[test]
    fn vacuum_into_con_parametro_crea_la_copia() {
        let ruta = ruta_temporal("vacuum.db");
        let copia = ruta_copia(&ruta, 1);
        let conn = Connection::open(&ruta).unwrap();
        conn.execute_batch("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (7);").unwrap();
        conn.execute("VACUUM INTO ?1", [copia.to_string_lossy().as_ref()]).unwrap();
        drop(conn);
        let c2 = Connection::open(&copia).unwrap();
        let x: i64 = c2.query_row("SELECT x FROM t", [], |f| f.get(0)).unwrap();
        assert_eq!(x, 7);
        drop(c2);
        let _ = std::fs::remove_file(&ruta);
        let _ = std::fs::remove_file(&copia);
    }
}
