//! Datos para sincronizar la lista con la cuenta de AniList.

use super::{Error, Resultado};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Tope de episodios que una bajada marca como vistos (el mismo que `anteriores` en `marcar_visto`).
pub const MAX_PROGRESO: i64 = 5000;
const MAX_BAJADAS: usize = 5000;
const MAX_NOMBRE: usize = 100;

/// Una serie vinculada con lo que hace falta para sincronizarla. `progreso` es el episodio entero más
/// alto del historial (AniList no guarda decimales).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SerieLocalSync {
    pub aid: i64,
    pub anilist_id: i64,
    pub estado: Option<u8>,
    /// Milisegundos; 0 si el estado no tiene hora o no hay estado.
    pub actualizado: i64,
    pub progreso: i64,
    pub episodios: Option<i64>,
}

/// Cuántos episodios vistos hay seguidos desde el 1 (1, 2, 3, ...). Un hueco corta la cuenta, los
/// decimales (especiales) se ignoran y una numeración que no arranca en 1 da 0. Es la regla de Mihon
/// («solo cuenta la lectura continua»): ver el episodio 12 sin el resto no son 12 episodios vistos.
/// Los números llegan ordenados de menor a mayor.
fn racha_continua(numeros: impl Iterator<Item = f64>) -> i64 {
    let mut siguiente = 1i64;
    for n in numeros {
        if n == siguiente as f64 {
            siguiente += 1;
        } else if n > siguiente as f64 {
            break;
        }
    }
    siguiente - 1
}

/// Series con vínculo `manual`, o `auto` con confianza >= 0,85 (las dudosas no se sincronizan).
/// Con `solo_aid` devuelve únicamente esa serie. `progreso` es la racha continua del historial.
pub fn series_para_sync(conn: &Connection, solo_aid: Option<i64>) -> Resultado<Vec<SerieLocalSync>> {
    let mut vistos = conn.prepare("SELECT numero FROM historial WHERE aid = ?1 ORDER BY numero")?;
    let mut st = conn.prepare(
        "SELECT v.aid, v.anilist_id, s.estado, COALESCE(s.actualizado, 0), 0,
                m.episodios
         FROM anilist_vinculo v
         LEFT JOIN anilist_media m ON m.anilist_id = v.anilist_id
         LEFT JOIN siguiendo s ON s.aid = v.aid
         WHERE v.anilist_id IS NOT NULL
           AND (v.origen = 'manual' OR (v.origen = 'auto' AND v.confianza >= 0.85))
           AND (?1 IS NULL OR v.aid = ?1)
         ORDER BY v.aid",
    )?;
    let filas = st.query_map(params![solo_aid], |f| {
        Ok(SerieLocalSync {
            aid: f.get(0)?,
            anilist_id: f.get(1)?,
            estado: f.get(2)?,
            actualizado: f.get(3)?,
            progreso: f.get(4)?,
            episodios: f.get(5)?,
        })
    })?;
    let mut series = filas.collect::<Result<Vec<_>, _>>()?;
    for s in &mut series {
        let numeros = vistos.query_map(params![s.aid], |f| f.get::<_, f64>(0))?;
        s.progreso = racha_continua(numeros.collect::<Result<Vec<_>, _>>()?.into_iter());
    }
    Ok(series)
}

/// Lo que AniList manda a local para una serie. `estado_en` (ms) es la hora remota del estado.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bajada {
    pub aid: i64,
    pub estado: Option<u8>,
    pub estado_en: Option<i64>,
    pub progreso: Option<i64>,
}

fn validar_bajada(b: &Bajada) -> Resultado<()> {
    if b.aid <= 0 {
        return Err(Error::Invalido("aid inválido".into()));
    }
    if let Some(e) = b.estado
        && !(1..=5).contains(&e)
    {
        return Err(Error::Invalido(format!("estado inválido: {e} (se espera de 1 a 5)")));
    }
    if let Some(t) = b.estado_en
        && t < 0
    {
        return Err(Error::Invalido("la hora del estado no puede ser negativa".into()));
    }
    if let Some(p) = b.progreso
        && !(1..=MAX_PROGRESO).contains(&p)
    {
        return Err(Error::Invalido(format!("progreso inválido: {p} (se espera de 1 a {MAX_PROGRESO})")));
    }
    Ok(())
}

/// Aplica las bajadas en una sola transacción (si una falla no cambia nada) y devuelve cuántas se
/// aplicaron. El estado sin hora remota se fecha con `ahora`. El progreso `n` marca vistos los
/// episodios `1..=n` sin pisar los que ya lo estaban y borra su progreso pendiente.
pub fn aplicar_bajadas(conn: &Connection, ahora: i64, bajadas: &[Bajada]) -> Resultado<u32> {
    if bajadas.len() > MAX_BAJADAS {
        return Err(Error::Invalido(format!("demasiadas bajadas (máximo {MAX_BAJADAS})")));
    }
    bajadas.iter().try_for_each(validar_bajada)?;
    let tx = conn.unchecked_transaction()?;
    for b in bajadas {
        if let Some(estado) = b.estado {
            tx.execute(
                "INSERT INTO siguiendo (aid, estado, actualizado) VALUES (?1, ?2, ?3)
                 ON CONFLICT(aid) DO UPDATE SET estado = excluded.estado, actualizado = excluded.actualizado",
                params![b.aid, estado, b.estado_en.unwrap_or(ahora)],
            )?;
        }
        if let Some(n) = b.progreso {
            tx.execute("DELETE FROM progreso WHERE aid = ?1 AND numero <= ?2", params![b.aid, n as f64])?;
            for numero in 1..=n {
                tx.execute(
                    "INSERT INTO historial (aid, numero, visto_en) VALUES (?1, ?2, ?3)
                     ON CONFLICT(aid, numero) DO NOTHING",
                    params![b.aid, numero as f64, ahora],
                )?;
            }
        }
    }
    tx.commit()?;
    Ok(bajadas.len() as u32)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cuenta {
    pub usuario_id: i64,
    pub nombre: String,
    /// Milisegundos de la última sincronización completa; `None` = aún no hubo (pide vista previa).
    pub ultima_sync: Option<i64>,
}

pub fn leer_cuenta(conn: &Connection) -> Resultado<Option<Cuenta>> {
    Ok(conn
        .query_row("SELECT usuario_id, nombre, ultima_sync FROM anilist_cuenta WHERE id = 1", [], |f| {
            Ok(Cuenta { usuario_id: f.get(0)?, nombre: f.get(1)?, ultima_sync: f.get(2)? })
        })
        .optional()?)
}

/// Guarda la cuenta conectada. Si es la misma, conserva `ultima_sync`; si cambia, la borra.
pub fn guardar_cuenta(conn: &Connection, usuario_id: i64, nombre: &str) -> Resultado<()> {
    if usuario_id <= 0 {
        return Err(Error::Invalido("usuario_id inválido".into()));
    }
    let nombre = nombre.trim();
    if nombre.is_empty() || nombre.chars().count() > MAX_NOMBRE {
        return Err(Error::Invalido(format!("el nombre debe tener de 1 a {MAX_NOMBRE} caracteres")));
    }
    conn.execute(
        "INSERT INTO anilist_cuenta (id, usuario_id, nombre, ultima_sync) VALUES (1, ?1, ?2, NULL)
         ON CONFLICT(id) DO UPDATE SET
             ultima_sync = CASE WHEN anilist_cuenta.usuario_id = excluded.usuario_id
                                THEN anilist_cuenta.ultima_sync ELSE NULL END,
             usuario_id = excluded.usuario_id, nombre = excluded.nombre",
        params![usuario_id, nombre],
    )?;
    Ok(())
}

pub fn borrar_cuenta(conn: &Connection) -> Resultado<()> {
    conn.execute("DELETE FROM anilist_cuenta", [])?;
    Ok(())
}

/// Anota la hora de la última sincronización completa. Falla si no hay cuenta conectada.
pub fn marcar_sincronizada(conn: &Connection, ahora: i64) -> Resultado<()> {
    let n = conn.execute("UPDATE anilist_cuenta SET ultima_sync = ?1 WHERE id = 1", params![ahora])?;
    if n == 0 {
        return Err(Error::Invalido("no hay una cuenta de AniList conectada".into()));
    }
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;
    use crate::datos::anilist::{fijar_vinculo, guardar_media, MediaAnilist};
    use crate::datos::progreso::Serie;

    fn obra(id: i64, episodios: Option<i64>) -> MediaAnilist {
        MediaAnilist { anilist_id: id, titulo_romaji: format!("Obra {id}"), episodios, ..Default::default() }
    }

    fn serie(aid: i64) -> (i64, String) {
        (aid, format!("serie-{aid}"))
    }

    fn vincular(conn: &Connection, aid: i64, anilist_id: i64, confianza: f64, origen: &str, episodios: Option<i64>) {
        guardar_media(conn, 1, &obra(anilist_id, episodios)).unwrap();
        let (a, slug) = serie(aid);
        let s = Serie { aid: a, slug: &slug, titulo: &slug };
        fijar_vinculo(conn, 1, &s, Some(anilist_id), confianza, origen).unwrap();
    }

    #[test]
    fn solo_entran_las_series_con_vinculo_firme() {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", Some(12));
        vincular(&conn, 2, 200, 0.70, "auto", None); // dudoso
        vincular(&conn, 3, 300, 0.70, "manual", None); // manual vale siempre
        let s = Serie { aid: 4, slug: "s4", titulo: "s4" };
        fijar_vinculo(&conn, 1, &s, None, 0.1, "ninguno").unwrap();
        let aids: Vec<i64> = series_para_sync(&conn, None).unwrap().iter().map(|x| x.aid).collect();
        assert_eq!(aids, vec![1, 3]);
    }

    #[test]
    fn trae_estado_hora_progreso_y_episodios() {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", Some(12));
        conn.execute("INSERT INTO siguiendo (aid, estado, actualizado) VALUES (1, 3, 777)", []).unwrap();
        conn.execute("INSERT INTO historial (aid, numero, visto_en) VALUES (1, 1.0, 1), (1, 2.0, 1)", []).unwrap();
        let s = &series_para_sync(&conn, None).unwrap()[0];
        assert_eq!((s.anilist_id, s.estado, s.actualizado, s.progreso, s.episodios), (100, Some(3), 777, 2, Some(12)));
    }

    fn progreso_con_historial(numeros: &[f64]) -> i64 {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", None);
        for n in numeros {
            conn.execute("INSERT INTO historial (aid, numero, visto_en) VALUES (1, ?1, 1)", params![n]).unwrap();
        }
        series_para_sync(&conn, None).unwrap()[0].progreso
    }

    #[test]
    fn el_progreso_es_la_racha_continua_desde_el_episodio_1() {
        assert_eq!(progreso_con_historial(&[]), 0);
        assert_eq!(progreso_con_historial(&[1.0, 2.0, 3.0]), 3);
        assert_eq!(progreso_con_historial(&[1.0, 2.0, 3.0, 5.0, 6.0]), 3, "un hueco corta la racha");
        assert_eq!(progreso_con_historial(&[12.0]), 0, "ver solo el 12 no son 12 episodios");
        assert_eq!(progreso_con_historial(&[14.0, 15.0, 25.0]), 0, "numeración corrida: no hay racha desde el 1");
        assert_eq!(progreso_con_historial(&[1.0, 2.0, 2.5, 3.0]), 3, "un especial 2.5 no rompe la racha");
        assert_eq!(progreso_con_historial(&[1.5, 2.0]), 0, "sin el episodio 1 entero no hay racha");
    }

    #[test]
    fn sin_estado_ni_historial_trae_none_y_cero_y_se_puede_filtrar_por_serie() {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", None);
        vincular(&conn, 2, 200, 0.95, "auto", None);
        let todas = series_para_sync(&conn, None).unwrap();
        assert_eq!((todas[0].estado, todas[0].actualizado, todas[0].progreso), (None, 0, 0));
        let una = series_para_sync(&conn, Some(2)).unwrap();
        assert_eq!(una.len(), 1);
        assert_eq!(una[0].aid, 2);
    }

    fn bajada(aid: i64) -> Bajada {
        Bajada { aid, estado: None, estado_en: None, progreso: None }
    }

    #[test]
    fn bajar_estado_crea_o_cambia_la_fila_con_la_hora_remota() {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", None);
        let b = Bajada { estado: Some(2), estado_en: Some(5000), ..bajada(1) };
        assert_eq!(aplicar_bajadas(&conn, 9999, &[b]).unwrap(), 1);
        let f: (i64, i64) = conn
            .query_row("SELECT estado, actualizado FROM siguiendo WHERE aid = 1", [], |f| Ok((f.get(0)?, f.get(1)?)))
            .unwrap();
        assert_eq!(f, (2, 5000));
        let b2 = Bajada { estado: Some(3), ..bajada(1) }; // sin hora remota: usa «ahora»
        aplicar_bajadas(&conn, 9999, &[b2]).unwrap();
        let t: i64 = conn.query_row("SELECT actualizado FROM siguiendo WHERE aid = 1", [], |f| f.get(0)).unwrap();
        assert_eq!(t, 9999);
    }

    #[test]
    fn bajar_progreso_marca_vistos_1_a_n_sin_pisar_fechas_y_limpia_el_progreso_pendiente() {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", None);
        conn.execute("INSERT INTO historial (aid, numero, visto_en) VALUES (1, 2.0, 111)", []).unwrap();
        conn.execute("INSERT INTO progreso VALUES (1, 3.0, 50.0, 1400.0, 1), (1, 9.0, 50.0, 1400.0, 1)", []).unwrap();
        aplicar_bajadas(&conn, 500, &[Bajada { progreso: Some(4), ..bajada(1) }]).unwrap();
        let vistos: Vec<(f64, i64)> = {
            let mut st = conn.prepare("SELECT numero, visto_en FROM historial WHERE aid = 1 ORDER BY numero").unwrap();
            st.query_map([], |f| Ok((f.get(0)?, f.get(1)?))).unwrap().map(|r| r.unwrap()).collect()
        };
        assert_eq!(vistos, vec![(1.0, 500), (2.0, 111), (3.0, 500), (4.0, 500)]);
        let pendientes: Vec<f64> = {
            let mut st = conn.prepare("SELECT numero FROM progreso WHERE aid = 1").unwrap();
            st.query_map([], |f| f.get(0)).unwrap().map(|r| r.unwrap()).collect()
        };
        assert_eq!(pendientes, vec![9.0], "solo se borra el progreso de lo que pasa a visto");
    }

    #[test]
    fn una_bajada_invalida_no_cambia_nada() {
        let conn = abrir_en_memoria().unwrap();
        vincular(&conn, 1, 100, 0.95, "auto", None);
        let buena = Bajada { estado: Some(1), ..bajada(1) };
        for mala in [
            Bajada { estado: Some(0), ..bajada(1) },
            Bajada { estado: Some(6), ..bajada(1) },
            Bajada { progreso: Some(0), ..bajada(1) },
            Bajada { progreso: Some(MAX_PROGRESO + 1), ..bajada(1) },
            Bajada { estado: Some(1), ..bajada(0) },
            Bajada { estado: Some(1), ..bajada(99) }, // serie desconocida: viola la clave foránea
        ] {
            assert!(aplicar_bajadas(&conn, 1, &[buena.clone(), mala]).is_err());
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM siguiendo", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 0, "la transacción entera se deshizo");
    }

    #[test]
    fn la_cuenta_se_guarda_se_lee_y_se_borra() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(leer_cuenta(&conn).unwrap(), None);
        guardar_cuenta(&conn, 42, "kristo").unwrap();
        assert_eq!(
            leer_cuenta(&conn).unwrap(),
            Some(Cuenta { usuario_id: 42, nombre: "kristo".into(), ultima_sync: None })
        );
        marcar_sincronizada(&conn, 1234).unwrap();
        assert_eq!(leer_cuenta(&conn).unwrap().unwrap().ultima_sync, Some(1234));
        guardar_cuenta(&conn, 42, "kristo2").unwrap(); // misma cuenta: conserva la última sincronización
        assert_eq!(leer_cuenta(&conn).unwrap().unwrap().ultima_sync, Some(1234));
        guardar_cuenta(&conn, 43, "otra").unwrap(); // otra cuenta: vuelve a pedir vista previa
        assert_eq!(leer_cuenta(&conn).unwrap().unwrap().ultima_sync, None);
        borrar_cuenta(&conn).unwrap();
        assert_eq!(leer_cuenta(&conn).unwrap(), None);
    }

    #[test]
    fn la_cuenta_rechaza_datos_invalidos_y_marcar_sin_cuenta_falla() {
        let conn = abrir_en_memoria().unwrap();
        assert!(guardar_cuenta(&conn, 0, "x").is_err());
        assert!(guardar_cuenta(&conn, 1, "  ").is_err());
        assert!(guardar_cuenta(&conn, 1, &"a".repeat(101)).is_err());
        assert!(marcar_sincronizada(&conn, 1).is_err());
    }
}
