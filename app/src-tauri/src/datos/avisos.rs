//! Avisos de episodios nuevos: qué series vigilar y hasta qué episodio se avisó.

use super::{Error, Resultado};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

const MAX_AVISADOS: usize = 5000;

/// Una serie que hay que mirar en la fuente. `ultimo_avisado` es `None` si nunca se vigiló; `ultimo_visto`
/// es el episodio más alto del historial (0 si no hay ninguno).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidata {
    pub aid: i64,
    pub slug: String,
    pub titulo: String,
    pub ultimo_avisado: Option<f64>,
    pub ultimo_visto: f64,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Avisado {
    pub aid: i64,
    pub ultimo: f64,
}

/// Series en Viendo con vínculo firme (`manual`, o `auto` con confianza >= 0,85) cuya obra sigue en
/// emisión en AniList.
pub fn candidatas(conn: &Connection) -> Resultado<Vec<Candidata>> {
    let mut st = conn.prepare(
        "SELECT a.aid, a.slug, a.titulo, av.ultimo_episodio,
                COALESCE((SELECT MAX(h.numero) FROM historial h WHERE h.aid = a.aid), 0)
         FROM anime a
         JOIN siguiendo s ON s.aid = a.aid AND s.estado = 1
         JOIN anilist_vinculo v ON v.aid = a.aid AND v.anilist_id IS NOT NULL
              AND (v.origen = 'manual' OR (v.origen = 'auto' AND v.confianza >= 0.85))
         JOIN anilist_media m ON m.anilist_id = v.anilist_id AND m.estado = 'RELEASING'
         LEFT JOIN avisos av ON av.aid = a.aid
         ORDER BY a.aid",
    )?;
    let filas = st.query_map([], |f| {
        Ok(Candidata {
            aid: f.get(0)?,
            slug: f.get(1)?,
            titulo: f.get(2)?,
            ultimo_avisado: f.get(3)?,
            ultimo_visto: f.get(4)?,
        })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

/// Anota hasta qué episodio se avisó de cada serie, todo o nada. `ahora` va en milisegundos.
pub fn guardar_avisados(conn: &Connection, ahora: i64, items: &[Avisado]) -> Resultado<()> {
    if items.len() > MAX_AVISADOS {
        return Err(Error::Invalido(format!("demasiados avisos (máximo {MAX_AVISADOS})")));
    }
    if items.iter().any(|i| i.aid <= 0 || !i.ultimo.is_finite() || i.ultimo <= 0.0) {
        return Err(Error::Invalido("aviso inválido".into()));
    }
    let tx = conn.unchecked_transaction()?;
    for i in items {
        tx.execute(
            "INSERT INTO avisos (aid, ultimo_episodio, avisado_en) VALUES (?1, ?2, ?3)
             ON CONFLICT(aid) DO UPDATE SET ultimo_episodio = excluded.ultimo_episodio,
                                            avisado_en = excluded.avisado_en",
            params![i.aid, i.ultimo, ahora],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    /// Serie `aid` con vínculo (`origen`, `confianza`), obra `aid * 10` en estado `obra` y estado local `estado`.
    fn serie(conn: &Connection, aid: i64, estado: i64, origen: &str, confianza: f64, obra: &str) {
        conn.execute("INSERT INTO anime (aid, slug, titulo) VALUES (?1, ?2, ?3)", params![aid, format!("s{aid}"), format!("T{aid}")]).unwrap();
        conn.execute("INSERT INTO siguiendo (aid, estado) VALUES (?1, ?2)", params![aid, estado]).unwrap();
        conn.execute(
            "INSERT INTO anilist_media (anilist_id, titulo_romaji, estado, actualizado) VALUES (?1, 'x', ?2, 0)",
            params![aid * 10, obra],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO anilist_vinculo (aid, anilist_id, confianza, origen, actualizado) VALUES (?1, ?2, ?3, ?4, 0)",
            params![aid, aid * 10, confianza, origen],
        )
        .unwrap();
    }

    #[test]
    fn candidatas_solo_incluye_viendo_con_vinculo_firme_y_obra_en_emision() {
        let conn = abrir_en_memoria().unwrap();
        serie(&conn, 1, 1, "auto", 0.9, "RELEASING"); // entra
        serie(&conn, 2, 1, "auto", 0.7, "RELEASING"); // vínculo dudoso
        serie(&conn, 3, 4, "auto", 0.9, "RELEASING"); // Dropeado
        serie(&conn, 4, 1, "auto", 0.9, "FINISHED"); // ya terminó
        serie(&conn, 5, 1, "manual", 0.0, "RELEASING"); // entra
        let aids: Vec<i64> = candidatas(&conn).unwrap().iter().map(|c| c.aid).collect();
        assert_eq!(aids, vec![1, 5]);
    }

    #[test]
    fn candidatas_trae_el_ultimo_visto_y_el_ultimo_avisado() {
        let conn = abrir_en_memoria().unwrap();
        serie(&conn, 1, 1, "manual", 1.0, "RELEASING");
        for n in [1.0, 2.0, 3.0] {
            conn.execute("INSERT INTO historial (aid, numero, visto_en) VALUES (1, ?1, 0)", params![n]).unwrap();
        }
        let c = &candidatas(&conn).unwrap()[0];
        assert_eq!((c.ultimo_visto, c.ultimo_avisado, c.slug.as_str()), (3.0, None, "s1"));
        guardar_avisados(&conn, 5, &[Avisado { aid: 1, ultimo: 4.0 }]).unwrap();
        assert_eq!(candidatas(&conn).unwrap()[0].ultimo_avisado, Some(4.0));
    }

    #[test]
    fn guardar_avisados_actualiza_y_rechaza_valores_invalidos_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        serie(&conn, 1, 1, "manual", 1.0, "RELEASING");
        serie(&conn, 2, 1, "manual", 1.0, "RELEASING");
        guardar_avisados(&conn, 5, &[Avisado { aid: 1, ultimo: 4.0 }]).unwrap();
        guardar_avisados(&conn, 6, &[Avisado { aid: 1, ultimo: 5.0 }]).unwrap();
        let (u, t): (f64, i64) = conn.query_row("SELECT ultimo_episodio, avisado_en FROM avisos WHERE aid = 1", [], |f| Ok((f.get(0)?, f.get(1)?))).unwrap();
        assert_eq!((u, t), (5.0, 6));
        for malo in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let r = guardar_avisados(&conn, 7, &[Avisado { aid: 2, ultimo: 3.0 }, Avisado { aid: 1, ultimo: malo }]);
            assert!(matches!(r, Err(Error::Invalido(_))), "{malo}");
        }
        assert!(guardar_avisados(&conn, 7, &[Avisado { aid: 0, ultimo: 1.0 }]).is_err());
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM avisos", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 1, "los intentos inválidos no escriben nada");
    }

    #[test]
    fn borrar_la_serie_borra_su_aviso() {
        let conn = abrir_en_memoria().unwrap();
        serie(&conn, 1, 1, "manual", 1.0, "RELEASING");
        guardar_avisados(&conn, 5, &[Avisado { aid: 1, ultimo: 4.0 }]).unwrap();
        conn.execute("DELETE FROM anime WHERE aid = 1", []).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM avisos", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 0);
    }
}
