//! Caché de la lista de episodios de cada serie: la última `Ficha` que dio la fuente, como JSON. Con ella la Ficha se
//! enseña al instante y se actualiza en segundo plano. Lo que llega es JSON de la fuente, no de fiar: se acota (tamaño,
//! forma de objeto y nombre de la serie) antes de guardarlo, y la app lo vuelve a validar al leerlo.

use super::{Error, Resultado};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

/// Series que se recuerdan: al guardar de más se borran las visitadas hace más tiempo.
pub const MAX_SERIES: i64 = 500;
const MAX_SLUG: usize = 200;
/// Una ficha real pesa unos pocos KB (incluso con cientos de episodios); más de 200 000 bytes no es una ficha.
const MAX_DATOS: usize = 200_000;

/// Lo guardado de una serie: la `Ficha` como JSON y cuándo se pidió (milisegundos desde 1970).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilaEpisodios {
    pub slug: String,
    pub datos: String,
    pub consultado_en: i64,
}

/// El nombre de una serie en la fuente: minúsculas, cifras y guiones.
fn slug_valido(slug: &str) -> bool {
    (1..=MAX_SLUG).contains(&slug.len()) && slug.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

pub fn leer(conn: &Connection, slug: &str) -> Resultado<Option<FilaEpisodios>> {
    Ok(conn
        .query_row(
            "SELECT slug, datos, consultado_en FROM episodios_cache WHERE slug = ?1",
            params![slug],
            |f| Ok(FilaEpisodios { slug: f.get(0)?, datos: f.get(1)?, consultado_en: f.get(2)? }),
        )
        .optional()?)
}

/// Guarda (o reemplaza) la ficha de una serie tras acotarla y poda las series más antiguas.
pub fn guardar(conn: &Connection, slug: &str, datos: &str, ahora_ms: i64) -> Resultado<()> {
    if !slug_valido(slug) {
        return Err(Error::Invalido("nombre de serie inválido".into()));
    }
    if datos.len() > MAX_DATOS {
        return Err(Error::Invalido("la ficha pesa demasiado".into()));
    }
    match serde_json::from_str::<serde_json::Value>(datos) {
        Ok(serde_json::Value::Object(_)) => {}
        _ => return Err(Error::Invalido("la ficha no es un objeto JSON".into())),
    }
    conn.execute(
        "INSERT INTO episodios_cache (slug, datos, consultado_en) VALUES (?1, ?2, ?3)
         ON CONFLICT(slug) DO UPDATE SET datos = excluded.datos, consultado_en = excluded.consultado_en",
        params![slug, datos, ahora_ms],
    )?;
    conn.execute(
        "DELETE FROM episodios_cache WHERE slug NOT IN
            (SELECT slug FROM episodios_cache ORDER BY consultado_en DESC, slug LIMIT ?1)",
        params![MAX_SERIES],
    )?;
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    const FICHA: &str = r#"{"title":"Death Note","episodes":[{"id":1,"number":1},{"id":2,"number":2}],"synopsis":"","genres":[],"status":"","anio":2006}"#;

    #[test]
    fn guarda_y_lee_y_el_segundo_guardado_reemplaza() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(leer(&conn, "death-note").unwrap(), None);
        guardar(&conn, "death-note", FICHA, 1_000).unwrap();
        let fila = leer(&conn, "death-note").unwrap().unwrap();
        assert_eq!(fila, FilaEpisodios { slug: "death-note".into(), datos: FICHA.into(), consultado_en: 1_000 });
        let nueva = r#"{"title":"Death Note","episodes":[]}"#;
        guardar(&conn, "death-note", nueva, 2_000).unwrap();
        let fila = leer(&conn, "death-note").unwrap().unwrap();
        assert_eq!((fila.datos.as_str(), fila.consultado_en), (nueva, 2_000));
    }

    #[test]
    fn cada_serie_tiene_su_propia_fila() {
        let conn = abrir_en_memoria().unwrap();
        guardar(&conn, "uno", r#"{"title":"Uno"}"#, 1).unwrap();
        guardar(&conn, "dos", r#"{"title":"Dos"}"#, 2).unwrap();
        assert_eq!(leer(&conn, "uno").unwrap().unwrap().datos, r#"{"title":"Uno"}"#);
        assert_eq!(leer(&conn, "dos").unwrap().unwrap().datos, r#"{"title":"Dos"}"#);
    }

    #[test]
    fn rechaza_nombres_de_serie_raros_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        let larga = "a".repeat(201);
        for malo in ["", "Death Note", "death_note", "death-note/../x", "ñandú", "a?b=1", larga.as_str()] {
            assert!(matches!(guardar(&conn, malo, FICHA, 1), Err(Error::Invalido(_))), "{malo:?}");
        }
        let filas: i64 = conn.query_row("SELECT COUNT(*) FROM episodios_cache", [], |f| f.get(0)).unwrap();
        assert_eq!(filas, 0);
    }

    #[test]
    fn rechaza_datos_que_no_son_un_objeto_json_o_pasan_del_tope() {
        let conn = abrir_en_memoria().unwrap();
        let enorme = format!(r#"{{"x":"{}"}}"#, "a".repeat(MAX_DATOS));
        for malo in ["", "no es json", "[1,2,3]", "42", "\"texto\"", "null", "{\"roto\":", enorme.as_str()] {
            assert!(matches!(guardar(&conn, "serie", malo, 1), Err(Error::Invalido(_))), "{malo:?}");
        }
        assert_eq!(leer(&conn, "serie").unwrap(), None);
    }

    #[test]
    fn guarda_como_mucho_las_ultimas_500_series() {
        let conn = abrir_en_memoria().unwrap();
        for i in 0..(MAX_SERIES + 5) {
            guardar(&conn, &format!("serie-{i}"), r#"{"title":"x"}"#, 1_000 + i).unwrap();
        }
        let filas: i64 = conn.query_row("SELECT COUNT(*) FROM episodios_cache", [], |f| f.get(0)).unwrap();
        assert_eq!(filas, MAX_SERIES);
        // Se fueron las más antiguas; las últimas siguen.
        assert_eq!(leer(&conn, "serie-0").unwrap(), None);
        assert_eq!(leer(&conn, "serie-4").unwrap(), None);
        assert!(leer(&conn, "serie-5").unwrap().is_some());
        assert!(leer(&conn, &format!("serie-{}", MAX_SERIES + 4)).unwrap().is_some());
    }

    #[test]
    fn volver_a_guardar_una_serie_la_rejuvenece_y_no_la_poda() {
        let conn = abrir_en_memoria().unwrap();
        for i in 0..MAX_SERIES {
            guardar(&conn, &format!("serie-{i}"), r#"{"title":"x"}"#, 1_000 + i).unwrap();
        }
        // La más antigua se vuelve a visitar: ahora es la más reciente.
        guardar(&conn, "serie-0", r#"{"title":"x"}"#, 9_999).unwrap();
        guardar(&conn, "nueva", r#"{"title":"x"}"#, 10_000).unwrap();
        assert!(leer(&conn, "serie-0").unwrap().is_some());
        assert_eq!(leer(&conn, "serie-1").unwrap(), None, "la siguiente más antigua es la que se va");
    }
}
