//! Progreso por episodio, historial y "Continuar viendo".

use super::{Error, Resultado};
use rusqlite::{Connection, params};

/// Identifica una serie: `aid` y `slug` son los de animeav1 (los mismos que usa el `.backup` de Ukiku).
pub struct Serie<'a> {
    pub aid: i64,
    pub slug: &'a str,
    pub titulo: &'a str,
}

pub(super) const MAX_TEXTO: usize = 300;

pub(super) fn validar_serie(serie: &Serie) -> Resultado<()> {
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

/// Registra la serie en `anime` solo si no estaba: no pisa un título que ya se conoce.
pub(super) fn registrar_anime_sin_pisar(conn: &Connection, serie: &Serie) -> Resultado<()> {
    conn.execute(
        "INSERT INTO anime (aid, slug, titulo) VALUES (?1, ?2, ?3) ON CONFLICT(aid) DO NOTHING",
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

/// Máximo de episodios anteriores que se aceptan en un solo marcado (hay series de más de mil).
const MAX_ANTERIORES: usize = 5000;

/// Números de episodio vistos de una serie, de menor a mayor.
pub fn episodios_vistos(conn: &Connection, aid: i64) -> Resultado<Vec<f64>> {
    let mut st = conn.prepare("SELECT numero FROM historial WHERE aid = ?1 ORDER BY numero")?;
    let filas = st.query_map(params![aid], |f| f.get::<_, f64>(0))?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

/// Marca un episodio como visto, en una sola transacción: borra su progreso, lo registra en el
/// historial y, si se indica `siguiente`, deja su progreso en 0:00 (sin pisar el que ya tuviera)
/// para que "Continuar viendo" ofrezca el próximo episodio. Los `anteriores` (episodios de la serie
/// con número menor) que no estuvieran vistos se registran también como vistos, sin pisar la fecha
/// de los que ya lo estaban, y se les borra el progreso pendiente.
pub fn marcar_visto(
    conn: &Connection,
    ahora: i64,
    serie: &Serie,
    numero: f64,
    siguiente: Option<f64>,
    anteriores: &[f64],
) -> Resultado<()> {
    validar_serie(serie)?;
    validar_numero("numero", numero)?;
    if let Some(s) = siguiente {
        validar_numero("siguiente", s)?;
    }
    if siguiente == Some(numero) {
        return Err(Error::Invalido("el siguiente episodio no puede ser el mismo".into()));
    }
    if anteriores.len() > MAX_ANTERIORES {
        return Err(Error::Invalido(format!("demasiados episodios anteriores (máximo {MAX_ANTERIORES})")));
    }
    for &a in anteriores {
        validar_numero("anterior", a)?;
        if a >= numero {
            return Err(Error::Invalido("un episodio anterior debe tener un número menor que el actual".into()));
        }
    }
    let tx = conn.unchecked_transaction()?;
    registrar_anime(&tx, serie)?;
    tx.execute("DELETE FROM progreso WHERE aid = ?1 AND numero = ?2", params![serie.aid, numero])?;
    tx.execute(
        "INSERT INTO historial (aid, numero, visto_en) VALUES (?1, ?2, ?3)
         ON CONFLICT(aid, numero) DO UPDATE SET visto_en = excluded.visto_en",
        params![serie.aid, numero, ahora],
    )?;
    for &a in anteriores {
        tx.execute("DELETE FROM progreso WHERE aid = ?1 AND numero = ?2", params![serie.aid, a])?;
        tx.execute(
            "INSERT INTO historial (aid, numero, visto_en) VALUES (?1, ?2, ?3)
             ON CONFLICT(aid, numero) DO NOTHING",
            params![serie.aid, a, ahora],
        )?;
    }
    if let Some(s) = siguiente {
        tx.execute(
            "INSERT INTO progreso (aid, numero, posicion_s, duracion_s, actualizado)
             VALUES (?1, ?2, 0, 0, ?3)
             ON CONFLICT(aid, numero) DO UPDATE SET actualizado = excluded.actualizado",
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
         ORDER BY actualizado DESC, aid DESC
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

/// Un episodio visto, para la pantalla Historial. `visto_en` va en milisegundos.
#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaHistorial {
    pub aid: i64,
    pub slug: String,
    pub titulo: String,
    pub numero: f64,
    pub visto_en: i64,
}

/// Episodios vistos, del más reciente al más antiguo, paginados. Solo las series con ficha en
/// `anime` (todas las que registran las escrituras e importaciones).
pub fn listar_historial(conn: &Connection, limite: u32, desplazamiento: u32) -> Resultado<Vec<EntradaHistorial>> {
    let mut st = conn.prepare(
        "SELECT a.aid, a.slug, a.titulo, h.numero, h.visto_en
         FROM historial h JOIN anime a ON a.aid = h.aid
         ORDER BY h.visto_en DESC, h.aid DESC, h.numero DESC
         LIMIT ?1 OFFSET ?2",
    )?;
    let filas = st.query_map(params![limite, desplazamiento], |f| {
        Ok(EntradaHistorial {
            aid: f.get(0)?,
            slug: f.get(1)?,
            titulo: f.get(2)?,
            numero: f.get(3)?,
            visto_en: f.get(4)?,
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

    /// Marca como vistos (aid, número, instante) con series sintéticas.
    fn sembrar_historial(conn: &Connection, vistos: &[(i64, f64, i64)]) {
        for &(aid, numero, ahora) in vistos {
            let slug = format!("serie-{aid}");
            let titulo = format!("Serie {aid}");
            let serie = Serie { aid, slug: &slug, titulo: &titulo };
            marcar_visto(conn, ahora, &serie, numero, None, &[]).unwrap();
        }
    }

    #[test]
    fn listar_historial_ordena_por_fecha_descendente_y_desempata() {
        let conn = abrir_en_memoria().unwrap();
        sembrar_historial(&conn, &[(1, 1.0, 100), (2, 5.0, 300), (1, 2.0, 300), (3, 1.0, 200)]);
        let h = listar_historial(&conn, 10, 0).unwrap();
        let claves: Vec<(i64, f64)> = h.iter().map(|e| (e.aid, e.numero)).collect();
        assert_eq!(claves, vec![(2, 5.0), (1, 2.0), (3, 1.0), (1, 1.0)]);
        assert_eq!(h[0].visto_en, 300);
        assert_eq!(h[0].titulo, "Serie 2");
        assert_eq!(h[0].slug, "serie-2");
    }

    #[test]
    fn listar_historial_pagina_sin_repetir_ni_saltarse_filas() {
        let conn = abrir_en_memoria().unwrap();
        sembrar_historial(&conn, &[(1, 1.0, 10), (1, 2.0, 20), (1, 3.0, 30), (1, 4.0, 40), (1, 5.0, 50)]);
        let a = listar_historial(&conn, 2, 0).unwrap();
        let b = listar_historial(&conn, 2, 2).unwrap();
        let c = listar_historial(&conn, 2, 4).unwrap();
        let numeros: Vec<f64> = a.iter().chain(&b).chain(&c).map(|e| e.numero).collect();
        assert_eq!(numeros, vec![5.0, 4.0, 3.0, 2.0, 1.0]);
        assert!(listar_historial(&conn, 2, 6).unwrap().is_empty());
    }

    #[test]
    fn listar_historial_de_una_base_vacia_es_vacio() {
        let conn = abrir_en_memoria().unwrap();
        assert!(listar_historial(&conn, 50, 0).unwrap().is_empty());
    }

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
        marcar_visto(&conn, 2000, &ONE_PIECE, 3.0, Some(4.0), &[]).unwrap();
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
        marcar_visto(&conn, 1, &ONE_PIECE, 12.0, None, &[]).unwrap();
        assert_eq!(contar(&conn, "progreso"), 0);
        assert_eq!(contar(&conn, "historial"), 1);
    }

    #[test]
    fn marcar_visto_funciona_sin_progreso_previo() {
        // Un episodio muy corto puede terminar antes de que se guarde nada.
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &NARUTO, 1.0, Some(2.0), &[]).unwrap();
        assert_eq!(progreso_de(&conn, 20, 2.0).unwrap(), Some(0.0));
    }

    #[test]
    fn marcar_visto_dos_veces_no_duplica_ni_pisa_el_siguiente() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 3.0, Some(4.0), &[]).unwrap();
        guardar_progreso(&conn, 2, &ONE_PIECE, 4.0, 90.0, 1400.0).unwrap();
        marcar_visto(&conn, 3, &ONE_PIECE, 3.0, Some(4.0), &[]).unwrap();
        assert_eq!(contar(&conn, "historial"), 1);
        assert_eq!(progreso_de(&conn, 10, 4.0).unwrap(), Some(90.0), "no pisa el avance del siguiente");
    }

    #[test]
    fn marcar_visto_con_datos_invalidos_no_deja_nada_a_medias() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 3.0, 10.0, 100.0).unwrap();
        assert!(marcar_visto(&conn, 2, &ONE_PIECE, 3.0, Some(f64::NAN), &[]).is_err());
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
    fn dos_series_con_aid_distinto_pueden_compartir_slug() {
        let conn = abrir_en_memoria().unwrap();
        let otra = Serie { aid: 99, slug: "one-piece", titulo: "Otra" };
        guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        guardar_progreso(&conn, 2, &otra, 1.0, 20.0, 100.0).unwrap();
        assert_eq!(progreso_de(&conn, 99, 1.0).unwrap(), Some(20.0));
    }

    #[test]
    fn marcar_visto_sube_la_serie_en_continuar_viendo_sin_pisar_el_siguiente() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 5.0, 50.0, 100.0).unwrap();
        guardar_progreso(&conn, 2000, &NARUTO, 1.0, 10.0, 100.0).unwrap();
        marcar_visto(&conn, 3000, &ONE_PIECE, 4.0, Some(5.0), &[]).unwrap();
        let v = continuar_viendo(&conn, 10).unwrap();
        assert_eq!((v[0].aid, v[0].numero, v[0].actualizado), (10, 5.0, 3000));
        assert_eq!(v[0].posicion_s, 50.0);
        assert_eq!(v[0].duracion_s, 100.0);
    }

    #[test]
    fn marcar_visto_rechaza_que_el_siguiente_sea_el_mismo_episodio() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 3.0, 10.0, 100.0).unwrap();
        assert!(marcar_visto(&conn, 2, &ONE_PIECE, 3.0, Some(3.0), &[]).is_err());
        assert_eq!(progreso_de(&conn, 10, 3.0).unwrap(), Some(10.0));
        assert_eq!(contar(&conn, "historial"), 0);
    }

    #[test]
    fn continuar_viendo_desempata_series_por_aid_mayor() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 1.0, 10.0, 100.0).unwrap();
        guardar_progreso(&conn, 1000, &NARUTO, 1.0, 10.0, 100.0).unwrap();
        let v = continuar_viendo(&conn, 10).unwrap();
        assert_eq!((v[0].aid, v[1].aid), (20, 10));
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
        marcar_visto(&conn, 3000, &NARUTO, 1.0, None, &[]).unwrap();
        let v = continuar_viendo(&conn, 10).unwrap();
        assert_eq!(v.len(), 1);
        assert_eq!(v[0].aid, 10);
    }

    #[test]
    fn descartar_progreso_quita_la_serie_de_continuar_viendo_pero_no_el_historial() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 1.0, Some(2.0), &[]).unwrap();
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

    #[test]
    fn episodios_vistos_devuelve_los_numeros_ordenados_y_solo_de_esa_serie() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 5.0, None, &[]).unwrap();
        marcar_visto(&conn, 2, &ONE_PIECE, 2.0, None, &[]).unwrap();
        marcar_visto(&conn, 3, &NARUTO, 9.0, None, &[]).unwrap();
        assert_eq!(episodios_vistos(&conn, 10).unwrap(), vec![2.0, 5.0]);
        assert_eq!(episodios_vistos(&conn, 20).unwrap(), vec![9.0]);
        assert!(episodios_vistos(&conn, 999).unwrap().is_empty());
    }

    #[test]
    fn marcar_visto_marca_tambien_los_anteriores_y_les_borra_el_progreso() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1000, &ONE_PIECE, 2.0, 50.0, 100.0).unwrap();
        marcar_visto(&conn, 2000, &ONE_PIECE, 5.0, Some(6.0), &[1.0, 2.0, 3.0, 4.0]).unwrap();
        assert_eq!(episodios_vistos(&conn, 10).unwrap(), vec![1.0, 2.0, 3.0, 4.0, 5.0]);
        assert_eq!(progreso_de(&conn, 10, 2.0).unwrap(), None, "el progreso pendiente del anterior se borra");
        assert_eq!(progreso_de(&conn, 10, 6.0).unwrap(), Some(0.0), "el siguiente queda en 0:00");
    }

    #[test]
    fn marcar_visto_no_pisa_la_fecha_de_los_anteriores_ya_vistos() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 3.0, None, &[1.0, 2.0]).unwrap();
        let fecha = |n: f64| -> i64 {
            conn.query_row("SELECT visto_en FROM historial WHERE aid = 10 AND numero = ?1", [n], |f| f.get(0)).unwrap()
        };
        assert_eq!(fecha(1.0), 1000, "no se pisa la fecha de un episodio ya visto");
        assert_eq!(fecha(2.0), 5000);
        assert_eq!(fecha(3.0), 5000);
    }

    #[test]
    fn marcar_visto_con_anteriores_repetidos_o_vacios_funciona() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 1, &ONE_PIECE, 4.0, None, &[1.0, 1.0, 2.0, 2.0]).unwrap();
        assert_eq!(episodios_vistos(&conn, 10).unwrap(), vec![1.0, 2.0, 4.0]);
        marcar_visto(&conn, 2, &ONE_PIECE, 4.0, None, &[]).unwrap();
        assert_eq!(episodios_vistos(&conn, 10).unwrap(), vec![1.0, 2.0, 4.0]);
    }

    #[test]
    fn marcar_visto_rechaza_anteriores_invalidos_sin_cambios_parciales() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 5.0, 10.0, 100.0).unwrap();
        for malos in [
            vec![1.0, f64::NAN],
            vec![1.0, -1.0],
            vec![1.0, f64::INFINITY],
            vec![1.0, 5.0], // igual a numero
            vec![1.0, 6.0], // mayor que numero
        ] {
            assert!(marcar_visto(&conn, 2, &ONE_PIECE, 5.0, None, &malos).is_err(), "{malos:?}");
        }
        assert!(episodios_vistos(&conn, 10).unwrap().is_empty(), "nada a medias");
        assert_eq!(progreso_de(&conn, 10, 5.0).unwrap(), Some(10.0), "el progreso sigue intacto");
    }

    #[test]
    fn marcar_visto_rechaza_demasiados_anteriores() {
        let conn = abrir_en_memoria().unwrap();
        let muchos: Vec<f64> = (0..5001).map(|n| n as f64).collect();
        assert!(marcar_visto(&conn, 1, &ONE_PIECE, 6000.0, None, &muchos).is_err());
        let justo: Vec<f64> = (0..5000).map(|n| n as f64).collect();
        marcar_visto(&conn, 1, &ONE_PIECE, 6000.0, None, &justo).unwrap();
        assert_eq!(episodios_vistos(&conn, 10).unwrap().len(), 5001);
    }
}
