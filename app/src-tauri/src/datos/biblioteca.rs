//! Biblioteca: estado de seguimiento ("siguiendo") y favoritos de cada serie.

use super::progreso::{registrar_anime_sin_pisar, validar_serie, Serie};
use super::{Error, Resultado};
use rusqlite::{params, Connection, OptionalExtension};

/// Estado de seguimiento de una serie (1 Viendo, 2 Considerando, 3 Completado, 4 Dropeado,
/// 5 Pausado), o `None` si no se sigue.
pub fn estado_serie(conn: &Connection, aid: i64) -> Resultado<Option<u8>> {
    Ok(conn
        .query_row("SELECT estado FROM siguiendo WHERE aid = ?1", params![aid], |f| f.get(0))
        .optional()?)
}

/// Fija el estado de una serie: `0` deja de seguirla (borra la fila); `1..=5` crea o cambia la fila.
pub fn fijar_estado(conn: &Connection, serie: &Serie, estado: u8) -> Resultado<()> {
    validar_serie(serie)?;
    match estado {
        0 => {
            conn.execute("DELETE FROM siguiendo WHERE aid = ?1", params![serie.aid])?;
        }
        1..=5 => {
            let tx = conn.unchecked_transaction()?;
            registrar_anime_sin_pisar(&tx, serie)?;
            tx.execute(
                "INSERT INTO siguiendo (aid, estado) VALUES (?1, ?2)
                 ON CONFLICT(aid) DO UPDATE SET estado = excluded.estado",
                params![serie.aid, estado],
            )?;
            tx.commit()?;
        }
        otro => return Err(Error::Invalido(format!("estado inválido: {otro} (se espera de 0 a 5)"))),
    }
    Ok(())
}

/// `true` si la serie está en favoritos.
pub fn es_favorito(conn: &Connection, aid: i64) -> Resultado<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM favoritos WHERE aid = ?1)", params![aid], |f| f.get(0))?)
}

/// Marca o desmarca la serie como favorita y devuelve si queda marcada. Al marcar, sin categoría.
pub fn alternar_favorito(conn: &Connection, serie: &Serie) -> Resultado<bool> {
    validar_serie(serie)?;
    let tx = conn.unchecked_transaction()?;
    let quitada = tx.execute("DELETE FROM favoritos WHERE aid = ?1", params![serie.aid])? > 0;
    if !quitada {
        registrar_anime_sin_pisar(&tx, serie)?;
        tx.execute("INSERT INTO favoritos (aid, categoria) VALUES (?1, NULL)", params![serie.aid])?;
    }
    tx.commit()?;
    Ok(!quitada)
}

/// Una fila de la biblioteca. `ultimo_episodio` es el número más alto del historial de la serie.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaBiblioteca {
    pub aid: i64,
    pub slug: String,
    pub titulo: String,
    pub estado: Option<u8>,
    pub ultimo_episodio: Option<f64>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct Biblioteca {
    pub siguiendo: Vec<EntradaBiblioteca>,
    pub favoritos: Vec<EntradaBiblioteca>,
}

fn entradas(conn: &Connection, sql: &str) -> Resultado<Vec<EntradaBiblioteca>> {
    let mut st = conn.prepare(sql)?;
    let filas = st.query_map([], |f| {
        Ok(EntradaBiblioteca {
            aid: f.get(0)?,
            slug: f.get(1)?,
            titulo: f.get(2)?,
            estado: f.get(3)?,
            ultimo_episodio: f.get(4)?,
        })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

/// Toda la biblioteca, sin orden garantizado (la interfaz ordena por título) y sin límite: son
/// cientos de filas. En favoritos, `estado` es el de `siguiendo` si la serie también se sigue.
pub fn listar_biblioteca(conn: &Connection) -> Resultado<Biblioteca> {
    let siguiendo = entradas(
        conn,
        "SELECT a.aid, a.slug, a.titulo, s.estado,
                (SELECT MAX(h.numero) FROM historial h WHERE h.aid = a.aid)
         FROM siguiendo s JOIN anime a ON a.aid = s.aid",
    )?;
    let favoritos = entradas(
        conn,
        "SELECT a.aid, a.slug, a.titulo, s.estado,
                (SELECT MAX(h.numero) FROM historial h WHERE h.aid = a.aid)
         FROM favoritos f JOIN anime a ON a.aid = f.aid LEFT JOIN siguiendo s ON s.aid = f.aid",
    )?;
    Ok(Biblioteca { siguiendo, favoritos })
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;
    use crate::datos::progreso::{guardar_progreso, marcar_visto};

    const ONE_PIECE: Serie<'static> = Serie { aid: 10, slug: "one-piece", titulo: "One Piece" };
    const NARUTO: Serie<'static> = Serie { aid: 20, slug: "naruto", titulo: "Naruto" };
    const AKIRA: Serie<'static> = Serie { aid: 30, slug: "akira", titulo: "Akira" };

    fn contar(conn: &Connection, tabla: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0)).unwrap()
    }

    fn titulo(conn: &Connection, aid: i64) -> String {
        conn.query_row("SELECT titulo FROM anime WHERE aid = ?1", [aid], |f| f.get(0)).unwrap()
    }

    #[test]
    fn una_serie_sin_fila_no_tiene_estado() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(estado_serie(&conn, 10).unwrap(), None);
    }

    #[test]
    fn fijar_estado_da_de_alta_y_cambia() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        assert_eq!(estado_serie(&conn, 10).unwrap(), Some(1));
        fijar_estado(&conn, &ONE_PIECE, 3).unwrap();
        assert_eq!(estado_serie(&conn, 10).unwrap(), Some(3));
        assert_eq!(contar(&conn, "siguiendo"), 1);
    }

    #[test]
    fn fijar_estado_cero_borra_la_fila_y_no_falla_si_no_habia() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 0).unwrap();
        fijar_estado(&conn, &ONE_PIECE, 2).unwrap();
        fijar_estado(&conn, &ONE_PIECE, 0).unwrap();
        assert_eq!(estado_serie(&conn, 10).unwrap(), None);
        assert_eq!(contar(&conn, "siguiendo"), 0);
        assert_eq!(contar(&conn, "anime"), 1, "dejar de seguir no borra la serie");
    }

    #[test]
    fn fijar_estado_rechaza_valores_fuera_de_rango_sin_tocar_nada() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 2).unwrap();
        for malo in [6u8, 7, 255] {
            assert!(fijar_estado(&conn, &ONE_PIECE, malo).is_err(), "{malo}");
        }
        assert_eq!(estado_serie(&conn, 10).unwrap(), Some(2));
    }

    #[test]
    fn fijar_estado_rechaza_series_invalidas() {
        let conn = abrir_en_memoria().unwrap();
        let sin_aid = Serie { aid: 0, slug: "x", titulo: "X" };
        let sin_slug = Serie { aid: 1, slug: "  ", titulo: "X" };
        for s in [&sin_aid, &sin_slug] {
            assert!(fijar_estado(&conn, s, 1).is_err());
        }
        assert_eq!(contar(&conn, "anime"), 0);
        assert_eq!(contar(&conn, "siguiendo"), 0);
    }

    #[test]
    fn fijar_estado_registra_la_serie_sin_pisar_un_titulo_conocido() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        fijar_estado(&conn, &Serie { aid: 10, slug: "one-piece", titulo: "Otro título" }, 1).unwrap();
        assert_eq!(titulo(&conn, 10), "One Piece");
        fijar_estado(&conn, &NARUTO, 4).unwrap();
        assert_eq!(titulo(&conn, 20), "Naruto");
    }

    #[test]
    fn alternar_favorito_marca_y_desmarca() {
        let conn = abrir_en_memoria().unwrap();
        assert!(!es_favorito(&conn, 10).unwrap());
        assert!(alternar_favorito(&conn, &ONE_PIECE).unwrap());
        assert!(es_favorito(&conn, 10).unwrap());
        let categoria: Option<String> =
            conn.query_row("SELECT categoria FROM favoritos WHERE aid = 10", [], |f| f.get(0)).unwrap();
        assert_eq!(categoria, None, "al marcar, sin categoría");
        assert!(!alternar_favorito(&conn, &ONE_PIECE).unwrap());
        assert!(!es_favorito(&conn, 10).unwrap());
        assert_eq!(contar(&conn, "favoritos"), 0);
        assert_eq!(contar(&conn, "anime"), 1, "desmarcar no borra la serie");
    }

    #[test]
    fn alternar_favorito_no_pisa_el_titulo_ni_toca_el_estado() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        fijar_estado(&conn, &ONE_PIECE, 2).unwrap();
        assert!(alternar_favorito(&conn, &Serie { aid: 10, slug: "one-piece", titulo: "Otro" }).unwrap());
        assert_eq!(titulo(&conn, 10), "One Piece");
        assert_eq!(estado_serie(&conn, 10).unwrap(), Some(2));
    }

    #[test]
    fn alternar_favorito_rechaza_series_invalidas() {
        let conn = abrir_en_memoria().unwrap();
        assert!(alternar_favorito(&conn, &Serie { aid: -1, slug: "x", titulo: "X" }).is_err());
        assert!(alternar_favorito(&conn, &Serie { aid: 1, slug: "x", titulo: "" }).is_err());
        assert_eq!(contar(&conn, "favoritos"), 0);
    }

    #[test]
    fn listar_biblioteca_trae_titulo_estado_y_ultimo_episodio() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 3.0, None, &[]).unwrap();
        marcar_visto(&conn, 2, &ONE_PIECE, 7.5, None, &[]).unwrap();
        fijar_estado(&conn, &NARUTO, 3).unwrap();
        alternar_favorito(&conn, &ONE_PIECE).unwrap();
        alternar_favorito(&conn, &AKIRA).unwrap();
        let mut b = listar_biblioteca(&conn).unwrap();
        b.siguiendo.sort_by_key(|e| e.aid);
        b.favoritos.sort_by_key(|e| e.aid);
        let one_piece = EntradaBiblioteca {
            aid: 10,
            slug: "one-piece".into(),
            titulo: "One Piece".into(),
            estado: Some(1),
            ultimo_episodio: Some(7.5),
        };
        let naruto = EntradaBiblioteca {
            aid: 20,
            slug: "naruto".into(),
            titulo: "Naruto".into(),
            estado: Some(3),
            ultimo_episodio: None,
        };
        let akira =
            EntradaBiblioteca { aid: 30, slug: "akira".into(), titulo: "Akira".into(), estado: None, ultimo_episodio: None };
        assert_eq!(b.siguiendo, vec![one_piece.clone(), naruto]);
        assert_eq!(b.favoritos, vec![one_piece, akira]);
    }

    #[test]
    fn una_base_sin_biblioteca_da_listas_vacias_aunque_haya_historial() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &NARUTO, 1.0, None, &[]).unwrap();
        let b = listar_biblioteca(&conn).unwrap();
        assert!(b.siguiendo.is_empty());
        assert!(b.favoritos.is_empty());
    }

    #[test]
    fn la_entrada_se_serializa_en_camel_case() {
        let e = EntradaBiblioteca { aid: 1, slug: "a".into(), titulo: "A".into(), estado: None, ultimo_episodio: Some(2.0) };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["ultimoEpisodio"], 2.0);
        assert!(v["estado"].is_null());
    }
}
