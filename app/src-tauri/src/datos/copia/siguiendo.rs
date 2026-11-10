//! El archivo `following` de la copia: series con su estado de seguimiento.

use super::{lista_de, lista_por_aid, resumen_por_aid, texto, Aplicado, Lista, ResumenLista};
use crate::datos::progreso::{registrar_anime_sin_pisar, Serie};
use crate::datos::Resultado;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

/// Una serie seguida, ya validada. `estado`: 1 Viendo, 2 Considerando, 3 Completado, 4 Dropeado,
/// 5 Pausado. `last_watched` se ignora: en Ukiku siempre vale -1.
#[derive(Debug, Clone, PartialEq)]
pub struct EntradaSiguiendo {
    pub aid: i64,
    pub nombre: String,
    pub slug: String,
    pub estado: u8,
}

fn entrada(v: &Value) -> Option<EntradaSiguiendo> {
    let aid = v.get("aid")?.as_i64().filter(|a| *a > 0)?;
    let estado = v.get("state")?.as_u64().filter(|s| (1..=5).contains(s)).and_then(|s| u8::try_from(s).ok())?;
    Some(EntradaSiguiendo { aid, nombre: texto(v.get("name"))?, slug: texto(v.get("slug"))?, estado })
}

/// Lee el `following`. Con `aid` repetido gana el último; `data: []` es válido.
pub fn parsear(contenido: &str) -> Resultado<Lista<EntradaSiguiendo>> {
    lista_por_aid(lista_de(contenido)?, entrada, |e: &EntradaSiguiendo| e.aid)
}

/// Recuento frente a la tabla `siguiendo`, sin escribir nada.
pub fn previsualizar(conn: &Connection, l: &Lista<EntradaSiguiendo>) -> Resultado<ResumenLista> {
    let aids: Vec<i64> = l.registros.iter().map(|e| e.aid).collect();
    resumen_por_aid(conn, "siguiendo", &aids, l.invalidos)
}

/// Aplica la lista dentro de la transacción del llamador. Gana el archivo: el estado de una serie
/// ya seguida se sobrescribe (como en Ukiku; no hay fechas que comparar). `reemplazar` vacía antes
/// la tabla `siguiendo`.
pub(super) fn aplicar_en(conn: &Connection, l: &Lista<EntradaSiguiendo>, reemplazar: bool) -> Resultado<Aplicado> {
    if reemplazar {
        conn.execute("DELETE FROM siguiendo", [])?;
    }
    let (mut nuevos, mut actualizados) = (0u32, 0u32);
    for e in &l.registros {
        registrar_anime_sin_pisar(conn, &Serie { aid: e.aid, slug: &e.slug, titulo: &e.nombre })?;
        let previo: Option<u8> = conn
            .query_row("SELECT estado FROM siguiendo WHERE aid = ?1", params![e.aid], |f| f.get(0))
            .optional()?;
        match previo {
            None => nuevos += 1,
            Some(estado) if estado != e.estado => actualizados += 1,
            Some(_) => {}
        }
        conn.execute(
            "INSERT INTO siguiendo (aid, estado, actualizado)
             VALUES (?1, ?2, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
             ON CONFLICT(aid) DO UPDATE SET estado = excluded.estado, actualizado = excluded.actualizado",
            params![e.aid, e.estado],
        )?;
    }
    Ok(Aplicado { nuevos, actualizados, invalidos: l.invalidos })
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::progreso::MAX_TEXTO;

    fn json(registros: &str) -> String {
        format!(r#"{{"version":2,"date":"08/11/2026 18:22","data":[{registros}]}}"#)
    }

    fn rec(aid: i64, estado: &str) -> String {
        format!(r#"{{"aid":{aid},"last_watched":-1,"name":"Serie {aid}","slug":"serie-{aid}","state":{estado}}}"#)
    }

    #[test]
    fn parsea_una_lista_valida_e_ignora_last_watched() {
        let l = parsear(&json(&format!("{},{}", rec(2, "3"), rec(1, "1")))).unwrap();
        assert_eq!(l.invalidos, 0);
        assert_eq!(
            l.registros,
            vec![
                EntradaSiguiendo { aid: 1, nombre: "Serie 1".into(), slug: "serie-1".into(), estado: 1 },
                EntradaSiguiendo { aid: 2, nombre: "Serie 2".into(), slug: "serie-2".into(), estado: 3 },
            ]
        );
    }

    #[test]
    fn omite_y_cuenta_los_registros_invalidos() {
        let largo = "x".repeat(MAX_TEXTO + 1);
        let malos = [
            rec(0, "1"),
            rec(-3, "1"),
            rec(1, "0"),
            rec(1, "6"),
            rec(1, "\"1\""),
            rec(1, "2.5"),
            rec(1, "null"),
            r#"{"aid":1,"name":"  ","slug":"a","state":1}"#.to_string(),
            r#"{"aid":1,"name":"a","state":1}"#.to_string(),
            format!(r#"{{"aid":1,"name":"{largo}","slug":"a","state":1}}"#),
            "[]".to_string(),
        ];
        let l = parsear(&json(&format!("{},{}", rec(5, "2"), malos.join(",")))).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.invalidos, 11);
    }

    #[test]
    fn con_aid_repetido_gana_el_ultimo_del_archivo() {
        let l = parsear(&json(&format!("{},{},{}", rec(1, "1"), rec(1, "4"), rec(1, "2")))).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.registros[0].estado, 2);
    }

    #[test]
    fn una_lista_vacia_es_valida() {
        let l = parsear(&json("")).unwrap();
        assert!(l.registros.is_empty());
        assert_eq!(l.invalidos, 0);
    }

    #[test]
    fn una_lista_con_registros_y_ninguno_valido_es_error() {
        let err = parsear(&json(&rec(0, "1"))).unwrap_err().to_string();
        assert!(err.contains("ningún registro válido"), "{err}");
    }

    #[test]
    fn rechaza_otra_version_json_roto_y_archivo_sin_lista() {
        assert!(parsear(r#"{"version":3,"data":[]}"#).unwrap_err().to_string().contains('3'));
        assert!(parsear("no es json").is_err());
        assert!(parsear(r#"{"version":2}"#).is_err());
    }

    #[test]
    fn actualizados_cuenta_solo_las_series_cuyo_estado_cambia() {
        let conn = crate::datos::abrir_en_memoria().unwrap();
        conn.execute_batch(
            "INSERT INTO anime VALUES (1, 's1', 'S1'), (2, 's2', 'S2');
             INSERT INTO siguiendo (aid, estado) VALUES (1, 3), (2, 1);",
        )
        .unwrap();
        let e = |aid: i64, estado: u8| EntradaSiguiendo { aid, nombre: format!("S{aid}"), slug: format!("s{aid}"), estado };
        let l = Lista { registros: vec![e(1, 3), e(2, 4), e(3, 1)], invalidos: 0 };
        let r = aplicar_en(&conn, &l, false).unwrap();
        assert_eq!((r.nuevos, r.actualizados), (1, 1));
    }
}
