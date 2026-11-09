//! Caché de lo que TMDB sabe de cada obra de AniList: dónde está su fondo y su logo. También guarda los
//! intentos sin resultado, para no repetir la búsqueda en cada Ficha.

use super::{Error, Resultado};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

/// Lo guardado de una obra. `tmdb_id` es `None` cuando se buscó y no se encontró nada.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilaTmdb {
    pub anilist_id: i64,
    pub tmdb_id: Option<i64>,
    /// `tv` o `movie`.
    pub tipo: Option<String>,
    pub fondo: Option<String>,
    pub logo: Option<String>,
    /// Milisegundos desde 1970 en que se consultó.
    pub consultado_en: i64,
}

/// Las rutas de TMDB son `/abc123.jpg`: se acepta solo eso, para que nada raro acabe en una URL de imagen.
fn ruta_valida(r: &str) -> bool {
    r.len() <= 100 && r.starts_with('/') && r[1..].chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

pub fn leer(conn: &Connection, anilist_id: i64) -> Resultado<Option<FilaTmdb>> {
    Ok(conn
        .query_row(
            "SELECT anilist_id, tmdb_id, tipo, fondo, logo, consultado_en FROM tmdb_media WHERE anilist_id = ?1",
            params![anilist_id],
            |f| {
                Ok(FilaTmdb {
                    anilist_id: f.get(0)?,
                    tmdb_id: f.get(1)?,
                    tipo: f.get(2)?,
                    fondo: f.get(3)?,
                    logo: f.get(4)?,
                    consultado_en: f.get(5)?,
                })
            },
        )
        .optional()?)
}

pub fn guardar(conn: &Connection, fila: &FilaTmdb) -> Resultado<()> {
    if fila.anilist_id <= 0 {
        return Err(Error::Invalido("obra de AniList inválida".into()));
    }
    if fila.tipo.as_deref().is_some_and(|t| t != "tv" && t != "movie") {
        return Err(Error::Invalido("tipo de TMDB inválido".into()));
    }
    for r in [&fila.fondo, &fila.logo].into_iter().flatten() {
        if !ruta_valida(r) {
            return Err(Error::Invalido("ruta de imagen de TMDB inválida".into()));
        }
    }
    conn.execute(
        "INSERT INTO tmdb_media (anilist_id, tmdb_id, tipo, fondo, logo, consultado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(anilist_id) DO UPDATE SET tmdb_id = excluded.tmdb_id, tipo = excluded.tipo,
             fondo = excluded.fondo, logo = excluded.logo, consultado_en = excluded.consultado_en",
        params![fila.anilist_id, fila.tmdb_id, fila.tipo, fila.fondo, fila.logo, fila.consultado_en],
    )?;
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    fn fila(id: i64) -> FilaTmdb {
        FilaTmdb {
            anilist_id: id,
            tmdb_id: Some(1429),
            tipo: Some("tv".into()),
            fondo: Some("/abc_1-2.jpg".into()),
            logo: Some("/logo.png".into()),
            consultado_en: 5,
        }
    }

    #[test]
    fn guarda_y_lee_y_el_segundo_guardado_reemplaza() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(leer(&conn, 1).unwrap(), None);
        guardar(&conn, &fila(1)).unwrap();
        assert_eq!(leer(&conn, 1).unwrap(), Some(fila(1)));
        let nueva = FilaTmdb { logo: None, consultado_en: 9, ..fila(1) };
        guardar(&conn, &nueva).unwrap();
        assert_eq!(leer(&conn, 1).unwrap(), Some(nueva));
    }

    #[test]
    fn guarda_un_intento_sin_resultado() {
        let conn = abrir_en_memoria().unwrap();
        let vacio = FilaTmdb { anilist_id: 2, tmdb_id: None, tipo: None, fondo: None, logo: None, consultado_en: 7 };
        guardar(&conn, &vacio).unwrap();
        assert_eq!(leer(&conn, 2).unwrap(), Some(vacio));
    }

    #[test]
    fn rechaza_rutas_y_tipos_raros_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        for mala in ["abc.jpg", "/a b.jpg", "/../x", "/a?x=1", "//x.com/y.jpg"] {
            let r = guardar(&conn, &FilaTmdb { fondo: Some(mala.into()), ..fila(3) });
            assert!(matches!(r, Err(Error::Invalido(_))), "{mala}");
        }
        assert!(guardar(&conn, &FilaTmdb { tipo: Some("otro".into()), ..fila(3) }).is_err());
        assert!(guardar(&conn, &FilaTmdb { anilist_id: 0, ..fila(3) }).is_err());
        assert_eq!(leer(&conn, 3).unwrap(), None);
    }
}
