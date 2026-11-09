//! Capa de datos locales: SQLite con migraciones por `PRAGMA user_version`.
//! Toda la lógica son funciones sobre `&Connection`; los comandos de Tauri viven en `comandos`.

pub mod ajustes;
pub mod anilist;
pub mod avisos;
pub mod biblioteca;
pub mod comandos;
pub mod copia;
pub mod progreso;
pub mod sync;

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
    slug   TEXT NOT NULL,
    titulo TEXT NOT NULL
);
CREATE INDEX anime_slug ON anime(slug);
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

/// Esquema de la versión 2: guarda el `eid` de Ukiku (para poder exportar algún día) y acelera
/// las consultas por fecha. Solo añade; no reconstruye tablas.
const V2: &str = "
ALTER TABLE historial ADD COLUMN eid INTEGER;
CREATE INDEX historial_visto ON historial(visto_en DESC);
";

/// Esquema de la versión 3: biblioteca (estado de seguimiento y favoritos). Solo crea tablas.
/// `favoritos.categoria` NULL = sin categoría.
const V3: &str = "
CREATE TABLE siguiendo (
    aid    INTEGER PRIMARY KEY REFERENCES anime(aid) ON DELETE CASCADE,
    estado INTEGER NOT NULL CHECK (estado BETWEEN 1 AND 5)
);
CREATE TABLE favoritos (
    aid       INTEGER PRIMARY KEY REFERENCES anime(aid) ON DELETE CASCADE,
    categoria TEXT
);
";

/// Esquema de la versión 4: caché de AniList (obras, vínculo con las series del usuario y agenda de
/// emisión). Solo crea tablas. Las horas de emisión van en segundos (como AniList); `actualizado`, en
/// milisegundos. `anilist_vinculo.origen = 'ninguno'` significa "se buscó y no hubo resultado".
const V4: &str = "
CREATE TABLE anilist_media (
    anilist_id    INTEGER PRIMARY KEY,
    mal_id        INTEGER,
    titulo_romaji TEXT NOT NULL,
    titulo_ingles TEXT,
    titulo_nativo TEXT,
    sinopsis      TEXT,
    generos       TEXT NOT NULL DEFAULT '[]',
    formato       TEXT,
    estudio       TEXT,
    puntuacion    INTEGER,
    episodios     INTEGER,
    estado        TEXT,
    portada       TEXT,
    banner        TEXT,
    siguiente_ep  INTEGER,
    siguiente_en  INTEGER,
    relaciones    TEXT NOT NULL DEFAULT '[]',
    sinonimos     TEXT NOT NULL DEFAULT '[]',
    anio          INTEGER,
    actualizado   INTEGER NOT NULL
);
CREATE TABLE anilist_vinculo (
    aid         INTEGER PRIMARY KEY REFERENCES anime(aid) ON DELETE CASCADE,
    anilist_id  INTEGER REFERENCES anilist_media(anilist_id),
    confianza   REAL NOT NULL,
    origen      TEXT NOT NULL CHECK (origen IN ('auto', 'manual', 'ninguno')),
    actualizado INTEGER NOT NULL,
    CHECK ((origen = 'ninguno') = (anilist_id IS NULL))
);
CREATE INDEX anilist_vinculo_media ON anilist_vinculo(anilist_id);
CREATE TABLE anilist_emision (
    anilist_id INTEGER NOT NULL REFERENCES anilist_media(anilist_id) ON DELETE CASCADE,
    episodio   INTEGER NOT NULL,
    emite_en   INTEGER NOT NULL,
    PRIMARY KEY (anilist_id, episodio)
);
CREATE INDEX anilist_emision_cuando ON anilist_emision(emite_en);
";

/// Esquema de la versión 5: sincronización con la cuenta de AniList. Solo agrega. `siguiendo.actualizado`
/// (milisegundos) decide quién gana cuando el estado difiere (las filas previas quedan en 0: gana AniList).
/// `anilist_cuenta` tiene a lo sumo una fila (`id = 1`); el token NO se guarda aquí.
const V5: &str = "
ALTER TABLE siguiendo ADD COLUMN actualizado INTEGER NOT NULL DEFAULT 0;
CREATE TABLE anilist_cuenta (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    usuario_id  INTEGER NOT NULL,
    nombre      TEXT NOT NULL,
    ultima_sync INTEGER
);
";

/// Esquema de la versión 6: avisos de episodios nuevos. Solo agrega. `ultimo_episodio` es el mayor episodio ya
/// avisado (o anotado en silencio la primera vez); `avisado_en` va en milisegundos.
const V6: &str = "
CREATE TABLE avisos (
    aid             INTEGER PRIMARY KEY REFERENCES anime(aid) ON DELETE CASCADE,
    ultimo_episodio REAL    NOT NULL CHECK (ultimo_episodio > 0),
    avisado_en      INTEGER NOT NULL
);
";

// Ojo: una migración que reconstruya tablas (patrón de 12 pasos de SQLite) debe desactivar `PRAGMA foreign_keys` FUERA de la transacción; con ON DELETE CASCADE, un DROP TABLE anime borraría progreso e historial.
/// Migraciones en orden: la posición `i` lleva la base de la versión `i` a la `i + 1`.
const MIGRACIONES: &[&str] = &[V1, V2, V3, V4, V5, V6];

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
        assert_eq!(tablas(&conn), vec![
                "ajustes",
                "anilist_cuenta",
                "anilist_emision",
                "anilist_media",
                "anilist_vinculo",
                "anime",
                "avisos",
                "favoritos",
                "historial",
                "progreso",
                "siguiendo"
            ]);
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

    #[test]
    fn la_migracion_a_v2_anade_eid_e_indice_y_conserva_los_datos() {
        let mut conn = Connection::open_in_memory().unwrap();
        configurar(&conn).unwrap();
        conn.execute_batch(V1).unwrap();
        conn.execute_batch("PRAGMA user_version = 1;").unwrap();
        conn.execute_batch("INSERT INTO anime VALUES (1, 'a', 'A'); INSERT INTO historial VALUES (1, 3.0, 777);")
            .unwrap();
        migrar(&mut conn).unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
        let fila: (i64, Option<i64>) = conn
            .query_row("SELECT visto_en, eid FROM historial WHERE aid = 1 AND numero = 3.0", [], |f| {
                Ok((f.get(0)?, f.get(1)?))
            })
            .unwrap();
        assert_eq!(fila, (777, None));
        let indices: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'historial_visto'",
                [],
                |f| f.get(0),
            )
            .unwrap();
        assert_eq!(indices, 1);
    }

    #[test]
    fn la_migracion_a_v3_crea_siguiendo_y_favoritos_y_conserva_los_datos() {
        let mut conn = Connection::open_in_memory().unwrap();
        configurar(&conn).unwrap();
        conn.execute_batch(V1).unwrap();
        conn.execute_batch(V2).unwrap();
        conn.execute_batch("PRAGMA user_version = 2;").unwrap();
        conn.execute_batch(
            "INSERT INTO anime VALUES (1, 'a', 'A');
             INSERT INTO historial (aid, numero, visto_en, eid) VALUES (1, 3.0, 777, 55);
             INSERT INTO progreso VALUES (1, 4.0, 10.0, 100.0, 888);",
        )
        .unwrap();
        migrar(&mut conn).unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
        let t = tablas(&conn);
        assert!(t.contains(&"siguiendo".to_string()) && t.contains(&"favoritos".to_string()), "{t:?}");
        let h: (i64, Option<i64>) = conn
            .query_row("SELECT visto_en, eid FROM historial WHERE aid = 1", [], |f| Ok((f.get(0)?, f.get(1)?)))
            .unwrap();
        assert_eq!(h, (777, Some(55)));
        let p: i64 = conn.query_row("SELECT COUNT(*) FROM progreso", [], |f| f.get(0)).unwrap();
        assert_eq!(p, 1);
    }

    #[test]
    fn siguiendo_solo_admite_estados_del_1_al_5_y_series_conocidas() {
        let conn = abrir_en_memoria().unwrap();
        conn.execute("INSERT INTO anime VALUES (1, 'a', 'A')", []).unwrap();
        for bueno in 1..=5 {
            conn.execute("INSERT OR REPLACE INTO siguiendo (aid, estado) VALUES (1, ?1)", [bueno]).unwrap();
        }
        for malo in [0, 6] {
            let r = conn.execute("INSERT OR REPLACE INTO siguiendo (aid, estado) VALUES (1, ?1)", [malo]);
            assert!(r.is_err(), "{malo}");
        }
        assert!(conn.execute("INSERT INTO siguiendo (aid, estado) VALUES (2, 1)", []).is_err(), "sin fila en anime");
        assert!(conn.execute("INSERT INTO favoritos (aid, categoria) VALUES (2, NULL)", []).is_err(), "sin fila en anime");
        conn.execute("INSERT INTO favoritos (aid, categoria) VALUES (1, NULL)", []).unwrap();
    }

    #[test]
    fn la_migracion_a_v4_crea_las_tablas_de_anilist_y_conserva_los_datos() {
        let mut conn = Connection::open_in_memory().unwrap();
        configurar(&conn).unwrap();
        conn.execute_batch(V1).unwrap();
        conn.execute_batch(V2).unwrap();
        conn.execute_batch(V3).unwrap();
        conn.execute_batch("PRAGMA user_version = 3;").unwrap();
        conn.execute_batch(
            "INSERT INTO anime VALUES (1, 'a', 'A');
             INSERT INTO siguiendo VALUES (1, 1);
             INSERT INTO historial (aid, numero, visto_en) VALUES (1, 3.0, 777);",
        )
        .unwrap();
        migrar(&mut conn).unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
        let t = tablas(&conn);
        for nombre in ["anilist_media", "anilist_vinculo", "anilist_emision"] {
            assert!(t.contains(&nombre.to_string()), "{t:?}");
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM historial", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn el_vinculo_exige_origen_valido_y_coherencia_con_anilist_id() {
        let conn = abrir_en_memoria().unwrap();
        conn.execute("INSERT INTO anime VALUES (1, 'a', 'A')", []).unwrap();
        conn.execute("INSERT INTO anilist_media (anilist_id, titulo_romaji, actualizado) VALUES (10, 'X', 0)", [])
            .unwrap();
        let ok = |sql: &str| conn.execute(sql, []);
        assert!(ok("INSERT INTO anilist_vinculo VALUES (1, 10, 0.9, 'auto', 0)").is_ok());
        conn.execute("DELETE FROM anilist_vinculo", []).unwrap();
        assert!(ok("INSERT INTO anilist_vinculo VALUES (1, NULL, 0.1, 'ninguno', 0)").is_ok());
        conn.execute("DELETE FROM anilist_vinculo", []).unwrap();
        assert!(ok("INSERT INTO anilist_vinculo VALUES (1, 10, 0.9, 'raro', 0)").is_err(), "origen inválido");
        assert!(ok("INSERT INTO anilist_vinculo VALUES (1, NULL, 0.9, 'auto', 0)").is_err(), "auto sin anilist_id");
        assert!(ok("INSERT INTO anilist_vinculo VALUES (1, 10, 0.9, 'ninguno', 0)").is_err(), "ninguno con anilist_id");
        assert!(ok("INSERT INTO anilist_vinculo VALUES (2, 10, 0.9, 'auto', 0)").is_err(), "sin fila en anime");
        assert!(ok("INSERT INTO anilist_vinculo VALUES (1, 99, 0.9, 'auto', 0)").is_err(), "media desconocida");
    }

    #[test]
    fn borrar_una_serie_borra_su_vinculo_pero_no_la_obra() {
        let conn = abrir_en_memoria().unwrap();
        conn.execute("INSERT INTO anime VALUES (1, 'a', 'A')", []).unwrap();
        conn.execute("INSERT INTO anilist_media (anilist_id, titulo_romaji, actualizado) VALUES (10, 'X', 0)", [])
            .unwrap();
        conn.execute("INSERT INTO anilist_vinculo VALUES (1, 10, 0.9, 'auto', 0)", []).unwrap();
        conn.execute("DELETE FROM anime WHERE aid = 1", []).unwrap();
        let v: i64 = conn.query_row("SELECT COUNT(*) FROM anilist_vinculo", [], |f| f.get(0)).unwrap();
        let m: i64 = conn.query_row("SELECT COUNT(*) FROM anilist_media", [], |f| f.get(0)).unwrap();
        assert_eq!((v, m), (0, 1));
    }

    #[test]
    fn la_migracion_a_v5_anade_actualizado_y_la_cuenta_y_conserva_los_datos() {
        let mut conn = Connection::open_in_memory().unwrap();
        configurar(&conn).unwrap();
        for v in [V1, V2, V3, V4] {
            conn.execute_batch(v).unwrap();
        }
        conn.execute_batch("PRAGMA user_version = 4;").unwrap();
        conn.execute_batch("INSERT INTO anime VALUES (1, 'a', 'A'); INSERT INTO siguiendo VALUES (1, 3);").unwrap();
        migrar(&mut conn).unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
        let fila: (i64, i64) = conn
            .query_row("SELECT estado, actualizado FROM siguiendo WHERE aid = 1", [], |f| Ok((f.get(0)?, f.get(1)?)))
            .unwrap();
        assert_eq!(fila, (3, 0), "las filas previas quedan con actualizado = 0");
        assert!(tablas(&conn).contains(&"anilist_cuenta".to_string()));
    }

    #[test]
    fn la_cuenta_de_anilist_solo_admite_una_fila() {
        let conn = abrir_en_memoria().unwrap();
        conn.execute("INSERT INTO anilist_cuenta (id, usuario_id, nombre) VALUES (1, 5, 'x')", []).unwrap();
        assert!(conn.execute("INSERT INTO anilist_cuenta (id, usuario_id, nombre) VALUES (2, 6, 'y')", []).is_err());
    }

    #[test]
    fn abrir_una_base_v2_guarda_la_copia_v2_antes_de_migrar() {
        let ruta = ruta_temporal("v2.db");
        {
            let conn = Connection::open(&ruta).unwrap();
            conn.execute_batch(V1).unwrap();
            conn.execute_batch(V2).unwrap();
            conn.execute_batch("PRAGMA user_version = 2; INSERT INTO anime VALUES (1, 'a', 'A');").unwrap();
        }
        let conn = abrir(&ruta).unwrap();
        assert_eq!(version_actual(&conn).unwrap(), VERSION);
        drop(conn);
        let copia = ruta_copia(&ruta, 2);
        let previa = Connection::open(&copia).unwrap();
        assert_eq!(version_actual(&previa).unwrap(), 2);
        let n: i64 = previa.query_row("SELECT COUNT(*) FROM anime", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 1);
        drop(previa);
        let _ = std::fs::remove_file(&copia);
        for sufijo in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{sufijo}", ruta.display()));
        }
    }
}
