//! El archivo `history` de la copia: episodios vistos.

use super::{lista_de, texto, Aplicado};
use crate::datos::progreso::{registrar_anime_sin_pisar, Serie};
use crate::datos::{Error, Resultado};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::collections::{HashMap, HashSet};

/// Un episodio visto, ya validado. `fecha` son milisegundos, como `historial.visto_en`.
#[derive(Debug, Clone, PartialEq)]
pub struct Registro {
    pub aid: i64,
    pub eid: Option<i64>,
    pub nombre: String,
    pub slug: String,
    pub numero: f64,
    pub fecha: i64,
}

#[derive(Debug)]
pub struct Lectura {
    pub registros: Vec<Registro>,
    pub invalidos: u32,
}

/// Valida un registro de `data`; `None` si algún campo no sirve (el llamador lo cuenta como inválido).
fn registro(v: &Value) -> Option<Registro> {
    let aid = v.get("aid")?.as_i64().filter(|a| *a > 0)?;
    let numero = v.get("number")?.as_f64().filter(|n| n.is_finite() && *n >= 0.0)?;
    let fecha = v.get("date")?.as_i64().filter(|d| *d >= 0)?;
    let eid = match v.get("eid") {
        None | Some(Value::Null) => None,
        Some(e) => Some(e.as_i64()?),
    };
    // `+ 0.0` normaliza -0.0 a 0.0 para que la clave de duplicados y la comparación en SQL coincidan.
    Some(Registro { aid, eid, nombre: texto(v.get("name"))?, slug: texto(v.get("slug"))?, numero: numero + 0.0, fecha })
}

/// Lee el `history`: con `(aid, número)` repetido se queda el de fecha más reciente. A diferencia de
/// `following` y `favs`, un `history` sin ningún episodio válido es error.
pub fn parsear(contenido: &str) -> Resultado<Lectura> {
    let datos = lista_de(contenido)?;
    let mut por_clave: HashMap<(i64, u64), Registro> = HashMap::new();
    let mut invalidos = 0u32;
    for v in &datos {
        let Some(r) = registro(v) else {
            invalidos += 1;
            continue;
        };
        let clave = (r.aid, r.numero.to_bits());
        if por_clave.get(&clave).is_none_or(|previo| r.fecha > previo.fecha) {
            por_clave.insert(clave, r);
        }
    }
    if por_clave.is_empty() {
        return Err(Error::Invalido("el archivo no tiene ningún episodio válido".into()));
    }
    let mut registros: Vec<Registro> = por_clave.into_values().collect();
    registros.sort_by(|a, b| a.aid.cmp(&b.aid).then(a.numero.total_cmp(&b.numero)));
    Ok(Lectura { registros, invalidos })
}

#[derive(Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumen {
    pub total: u32,
    pub series: u32,
    pub nuevos: u32,
    pub existentes: u32,
    pub invalidos: u32,
    pub actuales: u32,
}

fn existe(conn: &Connection, aid: i64, numero: f64) -> Resultado<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM historial WHERE aid = ?1 AND numero = ?2)",
        params![aid, numero],
        |f| f.get(0),
    )?)
}

/// Lo que pasaría al importar, sin escribir nada.
pub fn previsualizar(conn: &Connection, l: &Lectura) -> Resultado<Resumen> {
    let mut nuevos = 0u32;
    let mut series = HashSet::new();
    for r in &l.registros {
        series.insert(r.aid);
        if !existe(conn, r.aid, r.numero)? {
            nuevos += 1;
        }
    }
    let total = l.registros.len() as u32;
    let actuales: u32 = conn.query_row("SELECT COUNT(*) FROM historial", [], |f| f.get(0))?;
    Ok(Resumen { total, series: series.len() as u32, nuevos, existentes: total - nuevos, invalidos: l.invalidos, actuales })
}

/// Aplica la lectura dentro de la transacción del llamador. `reemplazar` vacía antes el historial
/// (solo el historial: borrar `anime` arrastraría el progreso por el ON DELETE CASCADE).
pub(super) fn aplicar_en(conn: &Connection, l: &Lectura, reemplazar: bool) -> Resultado<Aplicado> {
    if reemplazar {
        conn.execute("DELETE FROM historial", [])?;
    }
    let (mut nuevos, mut actualizados) = (0u32, 0u32);
    for r in &l.registros {
        registrar_anime_sin_pisar(conn, &Serie { aid: r.aid, slug: &r.slug, titulo: &r.nombre })?;
        let previo: Option<(i64, Option<i64>)> = conn
            .query_row(
                "SELECT visto_en, eid FROM historial WHERE aid = ?1 AND numero = ?2",
                params![r.aid, r.numero],
                |f| Ok((f.get(0)?, f.get(1)?)),
            )
            .optional()?;
        match previo {
            None => nuevos += 1,
            // Solo cuenta si la fila realmente cambia: fecha más reciente o un eid que faltaba.
            Some((visto_en, eid)) if r.fecha > visto_en || (eid.is_none() && r.eid.is_some()) => actualizados += 1,
            Some(_) => {}
        }
        conn.execute(
            "INSERT INTO historial (aid, numero, visto_en, eid) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(aid, numero) DO UPDATE SET
                 visto_en = MAX(visto_en, excluded.visto_en),
                 eid = COALESCE(eid, excluded.eid)",
            params![r.aid, r.numero, r.fecha, r.eid],
        )?;
        // Lo importado ya está visto: sin esto "Continuar viendo" ofrecería episodios terminados.
        conn.execute("DELETE FROM progreso WHERE aid = ?1 AND numero = ?2", params![r.aid, r.numero])?;
    }
    Ok(Aplicado { nuevos, actualizados, invalidos: l.invalidos })
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;
    use crate::datos::progreso::{guardar_progreso, marcar_visto, MAX_TEXTO};

    fn json(registros: &str) -> String {
        format!(r#"{{"version":2,"date":"08/11/2026 18:22","data":[{registros}]}}"#)
    }

    fn rec(aid: i64, eid: i64, numero: &str, fecha: i64) -> String {
        format!(r#"{{"aid":{aid},"date":{fecha},"eid":{eid},"name":"Serie {aid}","number":{numero},"slug":"serie-{aid}"}}"#)
    }

    #[test]
    fn parsea_un_historial_valido() {
        let l = parsear(&json(&format!("{},{}", rec(1, 10, "1.0", 1000), rec(1, 11, "2.5", 2000)))).unwrap();
        assert_eq!(l.invalidos, 0);
        assert_eq!(l.registros.len(), 2);
        assert_eq!(
            l.registros[1],
            Registro { aid: 1, eid: Some(11), nombre: "Serie 1".into(), slug: "serie-1".into(), numero: 2.5, fecha: 2000 }
        );
    }

    #[test]
    fn rechaza_otra_version_o_ninguna() {
        let otra = parsear(r#"{"version":3,"data":[]}"#).unwrap_err().to_string();
        assert!(otra.contains("3"), "{otra}");
        assert!(parsear(r#"{"data":[]}"#).is_err());
        assert!(parsear(r#"{"date":"x","data":[{"aid":1}]}"#).is_err());
    }

    #[test]
    fn rechaza_json_roto_y_archivo_sin_lista() {
        assert!(parsear("esto no es json").is_err());
        assert!(parsear(r#"{"version":2}"#).is_err());
        assert!(parsear(r#"{"version":2,"data":"no es lista"}"#).is_err());
    }

    #[test]
    fn omite_y_cuenta_los_registros_invalidos() {
        let largo = "x".repeat(MAX_TEXTO + 1);
        let malos = vec![
            r#"{"aid":0,"date":1,"eid":1,"name":"a","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"a","number":-1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":-5,"eid":1,"name":"a","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":"x","name":"a","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"  ","number":1.0,"slug":"a"}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"a","number":1.0,"slug":""}"#.to_string(),
            r#"{"aid":1,"date":1,"eid":1,"name":"a","number":"uno","slug":"a"}"#.to_string(),
            format!(r#"{{"aid":1,"date":1,"eid":1,"name":"{largo}","number":1.0,"slug":"a"}}"#),
            "[]".to_string(),
        ];
        let l = parsear(&json(&format!("{},{}", rec(1, 1, "1.0", 1), malos.join(",")))).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.invalidos, 9);
    }

    #[test]
    fn un_archivo_sin_ningun_registro_valido_es_error() {
        assert!(parsear(&json("")).is_err());
        assert!(parsear(&json(r#"{"aid":0}"#)).is_err());
    }

    #[test]
    fn con_duplicados_se_queda_el_de_fecha_mas_reciente() {
        let l = parsear(&json(&format!("{},{},{}", rec(1, 10, "1.0", 500), rec(1, 99, "1", 900), rec(1, 11, "1.0", 700))))
            .unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!((l.registros[0].fecha, l.registros[0].eid), (900, Some(99)));
    }

    #[test]
    fn eid_ausente_o_nulo_es_valido() {
        let sin = r#"{"aid":1,"date":5,"name":"a","number":1.0,"slug":"a"}"#;
        let nulo = r#"{"aid":2,"date":5,"eid":null,"name":"a","number":1.0,"slug":"a"}"#;
        let l = parsear(&json(&format!("{sin},{nulo}"))).unwrap();
        assert_eq!(l.invalidos, 0);
        assert!(l.registros.iter().all(|r| r.eid.is_none()));
    }

    fn reg(aid: i64, numero: f64, fecha: i64, eid: Option<i64>) -> Registro {
        Registro { aid, eid, nombre: format!("Backup {aid}"), slug: format!("serie-{aid}"), numero, fecha }
    }

    fn lectura(registros: Vec<Registro>) -> Lectura {
        Lectura { registros, invalidos: 0 }
    }

    const ONE_PIECE: Serie<'static> = Serie { aid: 10, slug: "one-piece", titulo: "One Piece" };

    fn fila(conn: &Connection, aid: i64, numero: f64) -> Option<(i64, Option<i64>)> {
        conn.query_row("SELECT visto_en, eid FROM historial WHERE aid = ?1 AND numero = ?2", params![aid, numero], |f| {
            Ok((f.get(0)?, f.get(1)?))
        })
        .ok()
    }

    fn contar(conn: &Connection, tabla: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0)).unwrap()
    }

    #[test]
    fn previsualizar_cuenta_nuevos_existentes_series_y_actuales() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 7.0, None, &[]).unwrap();
        let mut l = lectura(vec![reg(10, 1.0, 100, None), reg(10, 2.0, 100, None), reg(20, 1.0, 100, None)]);
        l.invalidos = 4;
        let r = previsualizar(&conn, &l).unwrap();
        assert_eq!(r, Resumen { total: 3, series: 2, nuevos: 2, existentes: 1, invalidos: 4, actuales: 2 });
        assert_eq!(contar(&conn, "historial"), 2, "la vista previa no escribe");
    }

    #[test]
    fn mezclar_agrega_los_nuevos_y_cuenta() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        let l = lectura(vec![reg(10, 1.0, 100, Some(1)), reg(10, 2.0, 200, Some(2)), reg(20, 1.0, 300, Some(3))]);
        let r = aplicar_en(&conn, &l, false).unwrap();
        assert_eq!(r, Aplicado { nuevos: 2, actualizados: 1, invalidos: 0 });
        assert_eq!(contar(&conn, "historial"), 3);
        assert_eq!(contar(&conn, "anime"), 2);
    }

    #[test]
    fn mezclar_conserva_la_fecha_mas_reciente() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 2.0, None, &[]).unwrap();
        aplicar_en(&conn, &lectura(vec![reg(10, 1.0, 9000, None), reg(10, 2.0, 100, None)]), false).unwrap();
        assert_eq!(fila(&conn, 10, 1.0).unwrap().0, 9000, "el archivo es más nuevo");
        assert_eq!(fila(&conn, 10, 2.0).unwrap().0, 5000, "lo local es más nuevo");
    }

    #[test]
    fn mezclar_rellena_el_eid_solo_si_faltaba() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        aplicar_en(&conn, &lectura(vec![reg(10, 1.0, 100, Some(7))]), false).unwrap();
        assert_eq!(fila(&conn, 10, 1.0).unwrap().1, Some(7));
        aplicar_en(&conn, &lectura(vec![reg(10, 1.0, 100, Some(8))]), false).unwrap();
        assert_eq!(fila(&conn, 10, 1.0).unwrap().1, Some(7), "un eid ya guardado no se pisa");
    }

    #[test]
    fn importar_no_pisa_el_titulo_de_una_serie_ya_conocida() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 5.0, 10.0, 1400.0).unwrap();
        aplicar_en(&conn, &lectura(vec![reg(10, 1.0, 100, None)]), false).unwrap();
        let titulo: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 10", [], |f| f.get(0)).unwrap();
        assert_eq!(titulo, "One Piece");
    }

    #[test]
    fn importar_borra_el_progreso_de_lo_importado_pero_no_el_de_otros_episodios() {
        let conn = abrir_en_memoria().unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 1.0, 100.0, 1400.0).unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 2.0, 100.0, 1400.0).unwrap();
        aplicar_en(&conn, &lectura(vec![reg(10, 1.0, 100, None)]), false).unwrap();
        assert_eq!(contar(&conn, "progreso"), 1);
        let queda: f64 = conn.query_row("SELECT numero FROM progreso", [], |f| f.get(0)).unwrap();
        assert_eq!(queda, 2.0);
    }

    #[test]
    fn reemplazar_vacia_el_historial_pero_conserva_las_series_y_el_progreso_ajeno() {
        let conn = abrir_en_memoria().unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 1.0, None, &[]).unwrap();
        marcar_visto(&conn, 5000, &ONE_PIECE, 2.0, None, &[]).unwrap();
        guardar_progreso(&conn, 1, &ONE_PIECE, 3.0, 100.0, 1400.0).unwrap();
        let r = aplicar_en(&conn, &lectura(vec![reg(20, 1.0, 100, None)]), true).unwrap();
        assert_eq!((r.nuevos, r.actualizados), (1, 0));
        assert_eq!(contar(&conn, "historial"), 1);
        assert!(fila(&conn, 10, 1.0).is_none());
        assert_eq!(contar(&conn, "anime"), 2, "las series de antes siguen en la base");
        assert_eq!(contar(&conn, "progreso"), 1, "el progreso de un episodio no importado sobrevive");
    }

    #[test]
    fn actualizados_cuenta_solo_las_filas_que_realmente_cambian() {
        let conn = abrir_en_memoria().unwrap();
        conn.execute_batch(
            "INSERT INTO anime VALUES (10, 'one-piece', 'One Piece');
             INSERT INTO historial (aid, numero, visto_en, eid) VALUES (10, 1.0, 5000, 5), (10, 2.0, 5000, 6), (10, 3.0, 5000, NULL);",
        )
        .unwrap();
        let l = lectura(vec![
            reg(10, 1.0, 100, Some(5)),  // idéntica en lo que cuenta: no cambia
            reg(10, 2.0, 9000, Some(6)), // fecha más reciente: cambia
            reg(10, 3.0, 100, Some(7)),  // rellena un eid que faltaba: cambia
            reg(10, 4.0, 100, None),     // nueva
        ]);
        let r = aplicar_en(&conn, &l, false).unwrap();
        assert_eq!((r.nuevos, r.actualizados), (1, 2));
    }
}
