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
    match estado {
        0 => {
            // Solo se usa el `aid`: slug y título no hacen falta para quitar de la lista.
            if serie.aid <= 0 {
                return Err(Error::Invalido("aid inválido".into()));
            }
            conn.execute("DELETE FROM siguiendo WHERE aid = ?1", params![serie.aid])?;
        }
        1..=5 => {
            validar_serie(serie)?;
            let tx = conn.unchecked_transaction()?;
            registrar_anime_sin_pisar(&tx, serie)?;
            tx.execute(
                "INSERT INTO siguiendo (aid, estado, actualizado)
                 VALUES (?1, ?2, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
                 ON CONFLICT(aid) DO UPDATE SET estado = excluded.estado, actualizado = excluded.actualizado",
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

/// Una fila de la biblioteca. `ultimo_episodio` es el número más alto del historial de la serie; `visto_en`, la última
/// actividad real (en ms): el progreso guardado o un episodio con marca de tiempo propia. Los episodios marcados de golpe
/// («Visto» hasta aquí, importaciones) comparten la misma marca y no cuentan; una serie solo con esas marcas queda en
/// `None`. `total`, los episodios de AniList o, si la obra sigue en emisión
/// sin total, los ya emitidos. `puntuacion` y `generos` son los de AniList (vacíos sin vínculo).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaBiblioteca {
    pub aid: i64,
    pub slug: String,
    pub titulo: String,
    pub estado: Option<u8>,
    pub ultimo_episodio: Option<f64>,
    pub visto_en: Option<i64>,
    pub vistos: i64,
    pub total: Option<i64>,
    pub puntuacion: Option<i64>,
    pub generos: Vec<String>,
}

#[derive(Debug, PartialEq, serde::Serialize)]
pub struct Biblioteca {
    pub siguiendo: Vec<EntradaBiblioteca>,
    pub favoritos: Vec<EntradaBiblioteca>,
}

/// Columnas comunes de las dos listas. `vistoEn` ignora las marcas de historial compartidas por varios episodios de la
/// misma serie (marcados de golpe) y suma el progreso del reproductor. `a` es `anime`, `s` es `siguiendo` y `m` es `anilist_media` (puede faltar).
const COLUMNAS: &str = "a.aid, a.slug, a.titulo, s.estado,
    (SELECT MAX(h.numero) FROM historial h WHERE h.aid = a.aid),
    NULLIF(MAX(COALESCE((SELECT MAX(h.visto_en) FROM historial h WHERE h.aid = a.aid AND NOT EXISTS (
                   SELECT 1 FROM historial h2 WHERE h2.aid = h.aid AND h2.visto_en = h.visto_en AND h2.numero <> h.numero)), 0),
               COALESCE((SELECT MAX(p.actualizado) FROM progreso p WHERE p.aid = a.aid), 0)), 0),
    (SELECT COUNT(*) FROM historial h WHERE h.aid = a.aid),
    m.episodios, m.siguiente_ep, m.puntuacion, m.generos";

/// Un vínculo `ninguno` no tiene `anilist_id`, así que no encuentra obra y deja `m` vacío.
const CON_ANILIST: &str =
    "LEFT JOIN anilist_vinculo v ON v.aid = a.aid LEFT JOIN anilist_media m ON m.anilist_id = v.anilist_id";

/// Total de episodios: el de AniList y, si no lo hay, los ya emitidos (`siguiente_ep - 1`). Nunca menos de 1.
fn total_de(episodios: Option<i64>, siguiente_ep: Option<i64>) -> Option<i64> {
    episodios.filter(|&n| n > 0).or_else(|| siguiente_ep.map(|s| s - 1).filter(|&n| n > 0))
}

fn entradas(conn: &Connection, sql: &str) -> Resultado<Vec<EntradaBiblioteca>> {
    let mut st = conn.prepare(sql)?;
    let filas = st.query_map([], |f| {
        let generos: Option<String> = f.get(10)?;
        Ok(EntradaBiblioteca {
            aid: f.get(0)?,
            slug: f.get(1)?,
            titulo: f.get(2)?,
            estado: f.get(3)?,
            ultimo_episodio: f.get(4)?,
            visto_en: f.get(5)?,
            vistos: f.get(6)?,
            total: total_de(f.get(7)?, f.get(8)?),
            puntuacion: f.get(9)?,
            // Un JSON roto en la caché no tumba la biblioteca: se queda sin géneros.
            generos: generos.and_then(|g| serde_json::from_str(&g).ok()).unwrap_or_default(),
        })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

/// Toda la biblioteca, sin orden garantizado (la interfaz ordena) y sin límite: son
/// cientos de filas. En favoritos, `estado` es el de `siguiendo` si la serie también se sigue.
pub fn listar_biblioteca(conn: &Connection) -> Resultado<Biblioteca> {
    let siguiendo =
        entradas(conn, &format!("SELECT {COLUMNAS} FROM siguiendo s JOIN anime a ON a.aid = s.aid {CON_ANILIST}"))?;
    let favoritos = entradas(
        conn,
        &format!(
            "SELECT {COLUMNAS} FROM favoritos f JOIN anime a ON a.aid = f.aid
             LEFT JOIN siguiendo s ON s.aid = f.aid {CON_ANILIST}"
        ),
    )?;
    Ok(Biblioteca { siguiendo, favoritos })
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;
    use crate::datos::anilist::{fijar_vinculo, guardar_media, MediaAnilist};
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
    fn fijar_estado_guarda_la_hora_del_cambio() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        let t: i64 = conn.query_row("SELECT actualizado FROM siguiendo WHERE aid = 10", [], |f| f.get(0)).unwrap();
        assert!(t > 1_700_000_000_000, "milisegundos desde 1970, no {t}");
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
    fn fijar_estado_cero_no_exige_titulo_ni_slug_pero_si_aid() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 2).unwrap();
        fijar_estado(&conn, &Serie { aid: 10, slug: "", titulo: "" }, 0).unwrap();
        assert_eq!(estado_serie(&conn, 10).unwrap(), None);
        assert!(fijar_estado(&conn, &Serie { aid: 0, slug: "", titulo: "" }, 0).is_err());
        assert!(fijar_estado(&conn, &Serie { aid: 10, slug: "x", titulo: "" }, 1).is_err(), "con 1 a 5 sí exige título");
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
            visto_en: Some(2),
            vistos: 2,
            total: None,
            puntuacion: None,
            generos: vec![],
        };
        let naruto = EntradaBiblioteca {
            aid: 20,
            slug: "naruto".into(),
            titulo: "Naruto".into(),
            estado: Some(3),
            ultimo_episodio: None,
            visto_en: None,
            vistos: 0,
            total: None,
            puntuacion: None,
            generos: vec![],
        };
        let akira = EntradaBiblioteca {
            aid: 30,
            slug: "akira".into(),
            titulo: "Akira".into(),
            estado: None,
            ultimo_episodio: None,
            visto_en: None,
            vistos: 0,
            total: None,
            puntuacion: None,
            generos: vec![],
        };
        assert_eq!(b.siguiendo, vec![one_piece.clone(), naruto]);
        assert_eq!(b.favoritos, vec![one_piece, akira]);
    }

    fn visto_en_de(conn: &Connection, aid: i64) -> Option<i64> {
        listar_biblioteca(conn).unwrap().siguiendo.iter().find(|e| e.aid == aid).unwrap().visto_en
    }

    #[test]
    fn visto_en_ignora_los_episodios_marcados_de_golpe() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        fijar_estado(&conn, &NARUTO, 1).unwrap();
        // Un solo marcado con anteriores estampa todos los episodios con la misma marca.
        marcar_visto(&conn, 9_000, &ONE_PIECE, 5.0, None, &[1.0, 2.0, 3.0, 4.0]).unwrap();
        assert_eq!(contar(&conn, "historial"), 5);
        assert_eq!(visto_en_de(&conn, 10), None);
        // Varias filas con la misma marca (importación): tampoco cuentan.
        marcar_visto(&conn, 7_000, &NARUTO, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 7_000, &NARUTO, 2.0, None, &[]).unwrap();
        assert_eq!(visto_en_de(&conn, 20), None);
    }

    #[test]
    fn visto_en_cuenta_los_episodios_vistos_de_uno_en_uno() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        marcar_visto(&conn, 1_000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 3_000, &ONE_PIECE, 2.0, None, &[]).unwrap();
        assert_eq!(visto_en_de(&conn, 10), Some(3_000));
    }

    #[test]
    fn visto_en_mezcla_marcado_de_golpe_posterior_con_una_marca_propia() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        marcar_visto(&conn, 1_000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        // Más tarde se marcan de golpe los episodios 2 a 4 (el 4 con los anteriores 2 y 3).
        marcar_visto(&conn, 8_000, &ONE_PIECE, 4.0, None, &[2.0, 3.0]).unwrap();
        assert_eq!(visto_en_de(&conn, 10), Some(1_000));
    }

    #[test]
    fn visto_en_suma_el_progreso_aunque_todo_el_historial_sea_de_golpe() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        marcar_visto(&conn, 9_000, &ONE_PIECE, 3.0, None, &[1.0, 2.0]).unwrap();
        guardar_progreso(&conn, 4_000, &ONE_PIECE, 4.0, 60.0, 1400.0).unwrap();
        assert_eq!(visto_en_de(&conn, 10), Some(4_000));
    }

    #[test]
    fn listar_biblioteca_trae_actividad_progreso_y_datos_de_anilist() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &ONE_PIECE, 1).unwrap();
        fijar_estado(&conn, &NARUTO, 2).unwrap();
        fijar_estado(&conn, &AKIRA, 3).unwrap();
        marcar_visto(&conn, 1_000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 2_000, &ONE_PIECE, 2.0, None, &[]).unwrap();
        // El progreso de un episodio a medias es más reciente que el último visto: cuenta como actividad.
        guardar_progreso(&conn, 5_000, &ONE_PIECE, 3.0, 600.0, 1400.0).unwrap();

        // One Piece: en emisión, sin total; se usa el último emitido (siguiente_ep - 1).
        let op = MediaAnilist {
            anilist_id: 7,
            titulo_romaji: "One Piece".into(),
            episodios: None,
            siguiente_ep: Some(1101),
            puntuacion: Some(87),
            generos: vec!["Action".into(), "Adventure".into()],
            ..Default::default()
        };
        guardar_media(&conn, 1, &op).unwrap();
        fijar_vinculo(&conn, 1, &ONE_PIECE, Some(7), 0.9, "auto").unwrap();
        // Naruto: total conocido, sin nota y con géneros rotos en la base.
        let na = MediaAnilist { anilist_id: 8, titulo_romaji: "Naruto".into(), episodios: Some(220), ..Default::default() };
        guardar_media(&conn, 1, &na).unwrap();
        fijar_vinculo(&conn, 1, &NARUTO, Some(8), 0.9, "auto").unwrap();
        conn.execute("UPDATE anilist_media SET generos = 'no es json' WHERE anilist_id = 8", []).unwrap();
        // Akira: se buscó y no hubo resultado.
        fijar_vinculo(&conn, 1, &AKIRA, None, 0.0, "ninguno").unwrap();

        let b = listar_biblioteca(&conn).unwrap();
        let de = |aid: i64| b.siguiendo.iter().find(|e| e.aid == aid).unwrap().clone();
        let one_piece = de(10);
        assert_eq!(
            (one_piece.visto_en, one_piece.vistos, one_piece.total, one_piece.puntuacion),
            (Some(5_000), 2, Some(1100), Some(87))
        );
        assert_eq!(one_piece.generos, vec!["Action".to_string(), "Adventure".to_string()]);
        let naruto = de(20);
        assert_eq!((naruto.visto_en, naruto.vistos, naruto.total, naruto.puntuacion), (None, 0, Some(220), None));
        assert!(naruto.generos.is_empty());
        let akira = de(30);
        assert_eq!((akira.total, akira.puntuacion), (None, None));
        assert!(akira.generos.is_empty());
    }

    #[test]
    fn un_siguiente_episodio_1_no_da_total() {
        let conn = abrir_en_memoria().unwrap();
        fijar_estado(&conn, &NARUTO, 1).unwrap();
        let m = MediaAnilist { anilist_id: 8, titulo_romaji: "Naruto".into(), siguiente_ep: Some(1), ..Default::default() };
        guardar_media(&conn, 1, &m).unwrap();
        fijar_vinculo(&conn, 1, &NARUTO, Some(8), 0.9, "auto").unwrap();
        assert_eq!(listar_biblioteca(&conn).unwrap().siguiendo[0].total, None);
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
        let e = EntradaBiblioteca {
            aid: 1,
            slug: "a".into(),
            titulo: "A".into(),
            estado: None,
            ultimo_episodio: Some(2.0),
            visto_en: None,
            vistos: 0,
            total: None,
            puntuacion: None,
            generos: vec![],
        };
        let v = serde_json::to_value(&e).unwrap();
        assert_eq!(v["ultimoEpisodio"], 2.0);
        assert!(v["estado"].is_null());
        for clave in ["vistoEn", "vistos", "total", "puntuacion", "generos"] {
            assert!(v.get(clave).is_some(), "falta la clave {clave}");
        }
    }
}
