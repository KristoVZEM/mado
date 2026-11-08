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

/// Una tarjeta de "Continuar viendo".
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaContinuar {
    pub aid: i64,
    pub slug: String,
    pub titulo: String,
    pub numero: f64,
    pub posicion_s: f64,
    pub duracion_s: f64,
    pub actualizado: i64,
}

/// Marca un episodio como visto, en una sola transacción: borra su progreso, lo registra en el
/// historial y, si se indica `siguiente`, deja su progreso en 0:00 (sin pisar el que ya tuviera)
/// para que "Continuar viendo" ofrezca el próximo episodio.
pub fn marcar_visto(
    conn: &Connection,
    ahora: i64,
    serie: &Serie,
    numero: f64,
    siguiente: Option<f64>,
) -> Resultado<()> {
    validar_serie(serie)?;
    validar_numero("numero", numero)?;
    if let Some(s) = siguiente {
        validar_numero("siguiente", s)?;
    }
    let tx = conn.unchecked_transaction()?;
    registrar_anime(&tx, serie)?;
    tx.execute("DELETE FROM progreso WHERE aid = ?1 AND numero = ?2", params![serie.aid, numero])?;
    tx.execute(
        "INSERT INTO historial (aid, numero, visto_en) VALUES (?1, ?2, ?3)
         ON CONFLICT(aid, numero) DO UPDATE SET visto_en = excluded.visto_en",
        params![serie.aid, numero, ahora],
    )?;
    if let Some(s) = siguiente {
        tx.execute(
            "INSERT INTO progreso (aid, numero, posicion_s, duracion_s, actualizado)
             VALUES (?1, ?2, 0, 0, ?3)
             ON CONFLICT(aid, numero) DO NOTHING",
            params![serie.aid, s, ahora],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Por serie, el episodio con progreso más reciente (a igualdad, el de número más alto), de la
/// serie tocada más recientemente a la más antigua.
pub fn continuar_viendo(conn: &Connection, limite: u32) -> Resultado<Vec<EntradaContinuar>> {
    let mut st = conn.prepare(
        "SELECT aid, slug, titulo, numero, posicion_s, duracion_s, actualizado FROM (
             SELECT a.aid, a.slug, a.titulo, p.numero, p.posicion_s, p.duracion_s, p.actualizado,
                    ROW_NUMBER() OVER (
                        PARTITION BY p.aid ORDER BY p.actualizado DESC, p.numero DESC
                    ) AS n
             FROM progreso p JOIN anime a ON a.aid = p.aid
         )
         WHERE n = 1
         ORDER BY actualizado DESC
         LIMIT ?1",
    )?;
    let filas = st.query_map(params![limite], |f| {
        Ok(EntradaContinuar {
            aid: f.get(0)?,
            slug: f.get(1)?,
            titulo: f.get(2)?,
            numero: f.get(3)?,
            posicion_s: f.get(4)?,
            duracion_s: f.get(5)?,
            actualizado: f.get(6)?,
        })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

/// Quita de "Continuar viendo" todo el progreso pendiente de una serie. El historial no se toca.
pub fn descartar_progreso(conn: &Connection, aid: i64) -> Resultado<()> {
    conn.execute("DELETE FROM progreso WHERE aid = ?1", params![aid])?;
    Ok(())
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

    const NARUTO: Serie<'static> = Serie { aid: 20, slug: "naruto", titulo: "Naruto" };

    fn contar(conn: &Connection, tabla: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0)).unwrap()
    }

    #[test]
    fn marcar_visto_borra_el_progreso_registra_el_historial_y_prepara_el_siguiente() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 3.0, 1200.0, 1400.0).unwrap();
        marcar_visto(&conn, 2000, &ONE_PIECE, 3.0, Some(4.0)).unwrap();
        assert_eq!(progreso_de(&conn, 10, 3.0).unwrap(), None);
        assert_eq!(progreso_de(&conn, 10, 4.0).unwrap(), Some(0.0));
        let visto: i64 = conn
            .query_row("SELECT visto_en FROM historial WHERE aid = 10 AND numero = 3", [], |f| f.get(0))
            .unwrap();
        assert_eq!(visto, 2000);
    }

    #[test]
    fn marcar_visto_sin_siguiente_no_crea_progreso() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 12.0, None).unwrap();
        assert_eq!(contar(&conn, "progreso"), 0);
        assert_eq!(contar(&conn, "historial"), 1);
    }

    #[test]
    fn marcar_visto_funciona_sin_progreso_previo() {
        // Un episodio muy corto puede terminar antes de que se guarde nada.
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &NARUTO, 1.0, Some(2.0)).unwrap();
        assert_eq!(progreso_de(&conn, 20, 2.0).unwrap(), Some(0.0));
    }

    #[test]
    fn marcar_visto_dos_veces_no_duplica_ni_pisa_el_siguiente() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 3.0, Some(4.0)).unwrap();
        guardar_progreso(&conn, 2, &ONE_PIECE, 4.0, 90.0, 1400.0).unwrap();
        marcar_visto(&conn, 3, &ONE_PIECE, 3.0, Some(4.0)).unwrap();
        assert_eq!(contar(&conn, "historial"), 1);
        assert_eq!(progreso_de(&conn, 10, 4.0).unwrap(), Some(90.0), "no pisa el avance del siguiente");
    }

    #[test]
    fn marcar_visto_con_datos_invalidos_no_deja_nada_a_medias() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 3.0, 10.0, 100.0).unwrap();
        assert!(marcar_visto(&conn, 2, &ONE_PIECE, 3.0, Some(f64::NAN)).is_err());
        assert_eq!(progreso_de(&conn, 10, 3.0).unwrap(), Some(10.0), "el progreso sigue intacto");
        assert_eq!(contar(&conn, "historial"), 0);
    }

    #[test]
    fn continuar_viendo_da_una_entrada_por_serie_la_mas_reciente_y_ordenada() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        guardar_progreso(&conn, 3000, &ONE_PIECE, 2.0, 20.0, 100.0).unwrap();
        guardar_progreso(&conn, 2000, &NARUTO, 5.0, 30.0, 100.0).unwrap();
        let v = continuar_viendo(&conn, 10).unwrap();
        assert_eq!(v.len(), 2);
        assert_eq!((v[0].aid, v[0].numero, v[0].actualizado), (10, 2.0, 3000));
        assert_eq!((v[1].aid, v[1].numero, v[1].actualizado), (20, 5.0, 2000));
        assert_eq!(v[0].titulo, "One Piece");
        assert_eq!(v[0].slug, "one-piece");
        assert_eq!(v[0].posicion_s, 20.0);
        assert_eq!(v[0].duracion_s, 100.0);
    }

    #[test]
    fn continuar_viendo_desempata_por_el_numero_mas_alto() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 2.0, 10.0, 100.0).unwrap();
        let v = continuar_viendo(&conn, 10).unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].numero, 2.0);
    }

    #[test]
    fn continuar_viendo_respeta_el_limite_y_no_incluye_series_vistas_del_todo() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        guardar_progreso(&conn, 2000, &NARUTO, 1.0, 10.0, 100.0).unwrap();
        assert_eq!(continuar_viendo(&conn, 1).unwrap().len(), 1);
        marcar_visto(&conn, 3000, &NARUTO, 1.0, None).unwrap();
        let v = continuar_viendo(&conn, 10).unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].aid, 10);
    }

    #[test]
    fn descartar_progreso_quita_la_serie_de_continuar_viendo_pero_no_el_historial() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 1.0, Some(2.0)).unwrap();
        guardar_progreso(&conn, 2, &ONE_PIECE, 2.0, 10.0, 100.0).unwrap();
        descartar_progreso(&conn, 10).unwrap();
        assert!(continuar_viendo(&conn, 10).unwrap().is_empty());
        assert_eq!(contar(&conn, "historial"), 1);
    }

    #[test]
    fn descartar_una_serie_sin_progreso_no_falla() {
        let conn = abrir_en_memoria().unwrap();
        descartar_progreso(&conn, 999).unwrap();
    }
}
