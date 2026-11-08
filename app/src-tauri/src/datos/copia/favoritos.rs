//! El archivo `favs` de la copia: series favoritas con su categoría.

use super::{existe_aid, lista_de, lista_por_aid, resumen_por_aid, texto, Aplicado, Lista, ResumenLista};
use crate::datos::progreso::{registrar_anime_sin_pisar, Serie};
use crate::datos::Resultado;
use rusqlite::{params, Connection};
use serde_json::Value;

/// Lo que Ukiku guarda como "sin categoría".
const SIN_CATEGORIA: &str = "_NONE_";

/// Un favorito ya validado. `categoria` es `None` si no tiene; `type` se ignora.
#[derive(Debug, Clone, PartialEq)]
pub struct EntradaFavorito {
    pub aid: i64,
    pub nombre: String,
    pub slug: String,
    pub categoria: Option<String>,
}

/// `Some(None)`: sin categoría (ausente, nula, en blanco o `_NONE_`). `None`: inválida.
fn categoria(v: Option<&Value>) -> Option<Option<String>> {
    match v {
        None | Some(Value::Null) => Some(None),
        Some(Value::String(s)) if s.trim().is_empty() || s.trim() == SIN_CATEGORIA => Some(None),
        otra => texto(otra).map(Some),
    }
}

fn entrada(v: &Value) -> Option<EntradaFavorito> {
    let aid = v.get("aid")?.as_i64().filter(|a| *a > 0)?;
    Some(EntradaFavorito {
        aid,
        nombre: texto(v.get("name"))?,
        slug: texto(v.get("slug"))?,
        categoria: categoria(v.get("category"))?,
    })
}

/// Lee el `favs`. Con `aid` repetido gana el último; `data: []` es válido.
pub fn parsear(contenido: &str) -> Resultado<Lista<EntradaFavorito>> {
    lista_por_aid(lista_de(contenido)?, entrada, |e: &EntradaFavorito| e.aid)
}

/// Recuento frente a la tabla `favoritos`, sin escribir nada.
pub fn previsualizar(conn: &Connection, l: &Lista<EntradaFavorito>) -> Resultado<ResumenLista> {
    let aids: Vec<i64> = l.registros.iter().map(|e| e.aid).collect();
    resumen_por_aid(conn, "favoritos", &aids, l.invalidos)
}

/// Aplica la lista dentro de la transacción del llamador. Gana el archivo, también en la categoría
/// (como en Ukiku). `reemplazar` vacía antes la tabla `favoritos`.
pub(super) fn aplicar_en(conn: &Connection, l: &Lista<EntradaFavorito>, reemplazar: bool) -> Resultado<Aplicado> {
    if reemplazar {
        conn.execute("DELETE FROM favoritos", [])?;
    }
    let (mut nuevos, mut actualizados) = (0u32, 0u32);
    for e in &l.registros {
        registrar_anime_sin_pisar(conn, &Serie { aid: e.aid, slug: &e.slug, titulo: &e.nombre })?;
        if existe_aid(conn, "favoritos", e.aid)? {
            actualizados += 1;
        } else {
            nuevos += 1;
        }
        conn.execute(
            "INSERT INTO favoritos (aid, categoria) VALUES (?1, ?2)
             ON CONFLICT(aid) DO UPDATE SET categoria = excluded.categoria",
            params![e.aid, e.categoria],
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

    /// `categoria` va tal cual en el JSON (con sus comillas si es texto).
    fn rec(aid: i64, categoria: &str) -> String {
        format!(r#"{{"aid":{aid},"category":{categoria},"name":"Serie {aid}","slug":"serie-{aid}","type":"tv-anime"}}"#)
    }

    #[test]
    fn parsea_favoritos_con_y_sin_categoria() {
        let sin = r#"{"aid":4,"name":"Serie 4","slug":"serie-4"}"#;
        let l = parsear(&json(&format!(
            "{},{},{},{},{sin}",
            rec(1, r#""Acción""#),
            rec(2, r#""_NONE_""#),
            rec(3, "null"),
            rec(5, r#""  ""#)
        )))
        .unwrap();
        assert_eq!(l.invalidos, 0);
        let categorias: Vec<(i64, Option<String>)> = l.registros.iter().map(|e| (e.aid, e.categoria.clone())).collect();
        assert_eq!(categorias, vec![(1, Some("Acción".into())), (2, None), (3, None), (4, None), (5, None)]);
    }

    #[test]
    fn omite_y_cuenta_los_registros_invalidos() {
        let largo = format!("\"{}\"", "x".repeat(MAX_TEXTO + 1));
        let malos = [
            rec(0, "null"),
            rec(1, "7"),
            rec(1, &largo),
            r#"{"aid":1,"category":null,"name":"","slug":"a"}"#.to_string(),
            r#"{"aid":1,"name":"a"}"#.to_string(),
        ];
        let l = parsear(&json(&format!("{},{}", rec(9, "null"), malos.join(",")))).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.invalidos, 5);
    }

    #[test]
    fn con_aid_repetido_gana_el_ultimo_del_archivo() {
        let l = parsear(&json(&format!("{},{}", rec(1, r#""A""#), rec(1, r#""B""#)))).unwrap();
        assert_eq!(l.registros.len(), 1);
        assert_eq!(l.registros[0].categoria.as_deref(), Some("B"));
    }

    #[test]
    fn una_lista_vacia_es_valida() {
        let l = parsear(&json("")).unwrap();
        assert!(l.registros.is_empty());
        assert_eq!(l.invalidos, 0);
    }

    #[test]
    fn una_lista_con_registros_y_ninguno_valido_es_error() {
        assert!(parsear(&json(&rec(0, "null"))).is_err());
    }
}
