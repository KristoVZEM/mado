//! Progreso por episodio, historial y "Continuar viendo".

use super::{Error, Resultado};
use rusqlite::{Connection, params};

/// Identifica una serie: `aid` y `slug` son los de animeav1 (los mismos que usa el `.backup` de Ukiku).
pub struct Serie<'a> {
    pub aid: i64,
    pub slug: &'a str,
    pub titulo: &'a str,
}

const MAX_TEXTO: usize = 300;

fn validar_serie(serie: &Serie) -> Resultado<()> {
    if serie.aid <= 0 {
        return Err(Error::Invalido("aid inválido".into()));
    }
    for (nombre, texto) in [("slug", serie.slug), ("titulo", serie.titulo)] {
        if texto.trim().is_empty() || texto.len() > MAX_TEXTO {
            return Err(Error::Invalido(format!("{nombre} vacío o demasiado largo")));
        }
    }
    Ok(())
}

fn validar_numero(nombre: &str, valor: f64) -> Resultado<()> {
    if !valor.is_finite() || valor < 0.0 {
        return Err(Error::Invalido(format!("{nombre} debe ser un número finito y no negativo")));
    }
    Ok(())
}

/// Crea o actualiza la fila de `anime` (la caché de títulos para "Continuar viendo").
fn registrar_anime(conn: &Connection, serie: &Serie) -> Resultado<()> {
    conn.execute(
        "INSERT INTO anime (aid, slug, titulo) VALUES (?1, ?2, ?3)
         ON CONFLICT(aid) DO UPDATE SET slug = excluded.slug, titulo = excluded.titulo",
        params![serie.aid, serie.slug, serie.titulo],
    )?;
    Ok(())
}

/// Guarda (o actualiza) el punto en que va un episodio. No se exige `posicion_s <= duracion_s`:
/// mpv puede informar una duración aún en 0 o inexacta, y rechazar el guardado perdería progreso.
pub fn guardar_progreso(
    conn: &Connection,
    ahora: i64,
    serie: &Serie,
    numero: f64,
    posicion_s: f64,
    duracion_s: f64,
) -> Resultado<()> {
    validar_serie(serie)?;
    validar_numero("numero", numero)?;
    validar_numero("posicion_s", posicion_s)?;
    validar_numero("duracion_s", duracion_s)?;
    let tx = conn.unchecked_transaction()?;
    registrar_anime(&tx, serie)?;
    tx.execute(
        "INSERT INTO progreso (aid, numero, posicion_s, duracion_s, actualizado)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(aid, numero) DO UPDATE SET
             posicion_s = excluded.posicion_s,
             duracion_s = excluded.duracion_s,
             actualizado = excluded.actualizado",
        params![serie.aid, numero, posicion_s, duracion_s, ahora],
    )?;
    tx.commit()?;
    Ok(())
}

/// Segundo guardado de un episodio, si hay.
pub fn progreso_de(conn: &Connection, aid: i64, numero: f64) -> Resultado<Option<f64>> {
    validar_numero("numero", numero)?;
    let mut st = conn.prepare("SELECT posicion_s FROM progreso WHERE aid = ?1 AND numero = ?2")?;
    let mut filas = st.query(params![aid, numero])?;
    match filas.next()? {
        Some(f) => Ok(Some(f.get(0)?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    const ONE_PIECE: Serie<'static> = Serie { aid: 10, slug: "one-piece", titulo: "One Piece" };

    #[test]
    fn guardar_y_leer_el_progreso_de_un_episodio() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(progreso_de(&conn, 10, 1.0).unwrap(), None);
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 125.5, 1400.0).unwrap();
        assert_eq!(progreso_de(&conn, 10, 1.0).unwrap(), Some(125.5));
    }

    #[test]
    fn guardar_de_nuevo_actualiza_en_vez_de_duplicar() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 10.0, 1400.0).unwrap();
        guardar_progreso(&conn, 2000, &ONE_PIECE, 1.0, 300.0, 1400.0).unwrap();
        assert_eq!(progreso_de(&conn, 10, 1.0).unwrap(), Some(300.0));
        let filas: i64 = conn.query_row("SELECT COUNT(*) FROM progreso", [], |f| f.get(0)).unwrap();
        assert_eq!(filas, 1);
    }

    #[test]
    fn guardar_actualiza_el_titulo_de_la_serie() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 10.0, 1400.0).unwrap();
        let nueva = Serie { aid: 10, slug: "one-piece", titulo: "ONE PIECE" };
        guardar_progreso(&conn, 2000, &nueva, 1.0, 20.0, 1400.0).unwrap();
        let t: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 10", [], |f| f.get(0)).unwrap();
        assert_eq!(t, "ONE PIECE");
    }

    #[test]
    fn una_posicion_mayor_que_la_duracion_no_se_rechaza() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 50.0, 0.0).unwrap();
        assert_eq!(progreso_de(&conn, 10, 1.0).unwrap(), Some(50.0));
    }

    #[test]
    fn rechaza_numeros_no_finitos_o_negativos() {
        let conn = abrir_en_memoria().unwrap();
        for malo in [f64::NAN, f64::INFINITY, -1.0] {
            assert!(guardar_progreso(&conn, 1, &ONE_PIECE, malo, 1.0, 1.0).is_err());
            assert!(guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, malo, 1.0).is_err());
            assert!(guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, 1.0, malo).is_err());
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM progreso", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 0, "un guardado rechazado no deja nada a medias");
    }

    #[test]
    fn rechaza_series_invalidas() {
        let conn = abrir_en_memoria().unwrap();
        let sin_aid = Serie { aid: 0, slug: "x", titulo: "X" };
        let sin_slug = Serie { aid: 1, slug: "  ", titulo: "X" };
        let largo = "a".repeat(MAX_TEXTO + 1);
        let titulo_largo = Serie { aid: 1, slug: "x", titulo: &largo };
        for s in [&sin_aid, &sin_slug, &titulo_largo] {
            assert!(guardar_progreso(&conn, 1, s, 1.0, 1.0, 1.0).is_err());
        }
    }

    #[test]
    fn episodios_con_decimales_son_distintos() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 12.0, 10.0, 100.0).unwrap();
        guardar_progreso(&conn, 2, &ONE_PIECE, 12.5, 20.0, 100.0).unwrap();
        assert_eq!(progreso_de(&conn, 10, 12.0).unwrap(), Some(10.0));
        assert_eq!(progreso_de(&conn, 10, 12.5).unwrap(), Some(20.0));
    }
}
