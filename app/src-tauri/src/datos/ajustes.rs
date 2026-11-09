//! Ajustes clave/valor con lista fija de claves y rangos validados.

use super::{Error, Resultado};
use rusqlite::{Connection, params};

/// Claves numéricas: (clave, mínimo, máximo).
const NUMERICOS: &[(&str, f64, f64)] = &[
    ("volumen", 0.0, 100.0),
    ("salto_corto", 5.0, 60.0),
    ("salto_largo", 30.0, 180.0),
    ("velocidad", 0.5, 3.0),
    // Cuándo se cargó por última vez la agenda de emisión de AniList (milisegundos desde 1970).
    ("anilist_agenda_cargada", 0.0, 9.0e15),
    // Client ID de la app registrada en el portal de desarrolladores de AniList (no es secreto).
    ("anilist_client_id", 1.0, 2.0e9),
    // Versión de las reglas con que se repasaron los vínculos automáticos (0 = nunca).
    ("anilist_repaso_version", 0.0, 1000.0),
];

const PREFIJO_IDIOMA: &str = "idioma:";

fn invalido<T>(mensaje: impl Into<String>) -> Resultado<T> {
    Err(Error::Invalido(mensaje.into()))
}

/// `idioma:<aid>` con `aid` entero positivo (solo dígitos, sin ceros a la izquierda).
fn aid_de_idioma(clave: &str) -> Option<&str> {
    let aid = clave.strip_prefix(PREFIJO_IDIOMA)?;
    let valido = !aid.is_empty()
        && aid.len() <= 18
        && aid.bytes().all(|b| b.is_ascii_digit())
        && !aid.starts_with('0');
    valido.then_some(aid)
}

/// Comprueba que la clave exista en la lista permitida y que el valor esté en su rango.
pub fn validar(clave: &str, valor: &str) -> Resultado<()> {
    if let Some(&(_, min, max)) = NUMERICOS.iter().find(|(c, _, _)| *c == clave) {
        let n: f64 = valor.trim().parse().map_err(|_| Error::Invalido(format!("{clave}: no es un número")))?;
        if !n.is_finite() || n < min || n > max {
            return invalido(format!("{clave}: debe estar entre {min} y {max}"));
        }
        return Ok(());
    }
    if aid_de_idioma(clave).is_some() {
        return if valor == "SUB" || valor == "DUB" {
            Ok(())
        } else {
            invalido("idioma: debe ser SUB o DUB")
        };
    }
    invalido(format!("ajuste desconocido: {clave}"))
}

/// Valida solo la clave (para leer): acepta lo mismo que `validar` con un valor correcto.
fn validar_clave(clave: &str) -> Resultado<()> {
    if NUMERICOS.iter().any(|(c, _, _)| *c == clave) || aid_de_idioma(clave).is_some() {
        Ok(())
    } else {
        invalido(format!("ajuste desconocido: {clave}"))
    }
}

pub fn leer(conn: &Connection, clave: &str) -> Resultado<Option<String>> {
    validar_clave(clave)?;
    let mut st = conn.prepare("SELECT valor FROM ajustes WHERE clave = ?1")?;
    let mut filas = st.query(params![clave])?;
    match filas.next()? {
        Some(f) => Ok(Some(f.get(0)?)),
        None => Ok(None),
    }
}

pub fn guardar(conn: &Connection, clave: &str, valor: &str) -> Resultado<()> {
    validar(clave, valor)?;
    conn.execute(
        "INSERT INTO ajustes (clave, valor) VALUES (?1, ?2)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        params![clave, valor],
    )?;
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    #[test]
    fn el_client_id_de_anilist_es_un_entero_positivo() {
        let conn = abrir_en_memoria().unwrap();
        guardar(&conn, "anilist_client_id", "12345").unwrap();
        assert_eq!(leer(&conn, "anilist_client_id").unwrap(), Some("12345".to_string()));
        assert!(guardar(&conn, "anilist_client_id", "0").is_err());
        assert!(guardar(&conn, "anilist_client_id", "abc").is_err());
    }

    #[test]
    fn guardar_y_leer_un_ajuste() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(leer(&conn, "volumen").unwrap(), None);
        guardar(&conn, "volumen", "35").unwrap();
        assert_eq!(leer(&conn, "volumen").unwrap(), Some("35".to_string()));
        guardar(&conn, "volumen", "80").unwrap();
        assert_eq!(leer(&conn, "volumen").unwrap(), Some("80".to_string()));
    }

    #[test]
    fn los_limites_de_cada_clave_numerica_se_respetan() {
        let casos = [
            ("volumen", "0", "100", "-1", "101"),
            ("salto_corto", "5", "60", "4", "61"),
            ("salto_largo", "30", "180", "29", "181"),
            ("velocidad", "0.5", "3", "0.4", "3.1"),
            ("anilist_agenda_cargada", "0", "9000000000000000", "-1", "9000000000000001"),
        ];
        for (clave, min, max, bajo, alto) in casos {
            assert!(validar(clave, min).is_ok(), "{clave} acepta {min}");
            assert!(validar(clave, max).is_ok(), "{clave} acepta {max}");
            assert!(validar(clave, bajo).is_err(), "{clave} rechaza {bajo}");
            assert!(validar(clave, alto).is_err(), "{clave} rechaza {alto}");
        }
    }

    #[test]
    fn los_valores_no_numericos_o_no_finitos_se_rechazan() {
        for malo in ["", "abc", "NaN", "inf", "-inf", "1e999"] {
            assert!(validar("volumen", malo).is_err(), "volumen rechaza {malo:?}");
        }
    }

    #[test]
    fn el_idioma_es_por_serie_y_solo_sub_o_dub() {
        assert!(validar("idioma:123", "SUB").is_ok());
        assert!(validar("idioma:123", "DUB").is_ok());
        assert!(validar("idioma:123", "sub").is_err());
        assert!(validar("idioma:123", "ES").is_err());
    }

    #[test]
    fn la_clave_de_idioma_exige_un_aid_numerico_positivo() {
        for mala in ["idioma:", "idioma:0", "idioma:012", "idioma:-1", "idioma:1a", "idioma:1.5", "idioma:1234567890123456789"] {
            assert!(validar(mala, "SUB").is_err(), "{mala} debe rechazarse");
        }
    }

    #[test]
    fn las_claves_fuera_de_la_lista_se_rechazan_al_leer_y_al_guardar() {
        let conn = abrir_en_memoria().unwrap();
        for mala in ["x", "Volumen", "volumen ", "idioma", "sqlite_master", "'; DROP TABLE ajustes;--"] {
            assert!(guardar(&conn, mala, "1").is_err(), "guardar {mala:?}");
            assert!(leer(&conn, mala).is_err(), "leer {mala:?}");
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM ajustes", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn el_idioma_se_guarda_por_serie() {
        let conn = abrir_en_memoria().unwrap();
        guardar(&conn, "idioma:10", "DUB").unwrap();
        guardar(&conn, "idioma:20", "SUB").unwrap();
        assert_eq!(leer(&conn, "idioma:10").unwrap(), Some("DUB".to_string()));
        assert_eq!(leer(&conn, "idioma:20").unwrap(), Some("SUB".to_string()));
        assert_eq!(leer(&conn, "idioma:30").unwrap(), None);
    }
}
