//! Caché de los tiempos de intro de AniSkip: el tramo del opening (o «no hay») por serie de MyAnimeList, episodio y
//! duración del vídeo. La clave lleva la duración porque los tiempos dependen del corte. Los datos los envía cualquiera:
//! se revalidan aquí antes de guardarlos, además de en TypeScript.

use super::{Error, Resultado};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

const MS_POR_DIA: i64 = 24 * 3600 * 1000;
/// Un «no hay» se vuelve a mirar a los 7 días; un tramo, a los 30 (los votos de la comunidad pueden cambiarlo).
const CADUCA_NO_MS: i64 = 7 * MS_POR_DIA;
const CADUCA_SI_MS: i64 = 30 * MS_POR_DIA;
/// Un opening de menos de 5 s o de más de 300 s no lo es.
const MIN_TRAMO_S: f64 = 5.0;
const MAX_TRAMO_S: f64 = 300.0;

/// Lo guardado de un episodio. `estado` es `si` (con `inicio` y `fin`, en segundos) o `no` (sin tiempos).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilaIntro {
    pub mal_id: i64,
    pub episodio: i64,
    /// Duración del vídeo, redondeada al segundo: los tiempos dependen del corte.
    pub duracion_s: i64,
    pub estado: String,
    pub inicio: Option<f64>,
    pub fin: Option<f64>,
}

/// La fila guardada, o `None` si no existe o ya caducó. `ahora_ms` en milisegundos desde 1970.
pub fn leer(conn: &Connection, mal_id: i64, episodio: i64, duracion_s: i64, ahora_ms: i64) -> Resultado<Option<FilaIntro>> {
    let fila: Option<(FilaIntro, i64)> = conn
        .query_row(
            "SELECT estado, inicio, fin, consultado_en FROM intro_tiempos
             WHERE mal_id = ?1 AND episodio = ?2 AND duracion_s = ?3",
            params![mal_id, episodio, duracion_s],
            |f| {
                Ok((
                    FilaIntro { mal_id, episodio, duracion_s, estado: f.get(0)?, inicio: f.get(1)?, fin: f.get(2)? },
                    f.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()?;
    Ok(fila.and_then(|(fila, consultado_en)| {
        let caduca = if fila.estado == "si" { CADUCA_SI_MS } else { CADUCA_NO_MS };
        (ahora_ms.saturating_sub(consultado_en) <= caduca).then_some(fila)
    }))
}

fn finito(v: Option<f64>) -> Option<f64> {
    v.filter(|x| x.is_finite())
}

/// Guarda (o reemplaza) la fila tras revalidarla: lo que llega de AniSkip no es de fiar.
pub fn guardar(conn: &Connection, fila: &FilaIntro, ahora_ms: i64) -> Resultado<()> {
    if fila.mal_id <= 0 || fila.episodio < 0 || fila.duracion_s <= 0 {
        return Err(Error::Invalido("serie, episodio o duración inválidos".into()));
    }
    match fila.estado.as_str() {
        "no" => {
            if fila.inicio.is_some() || fila.fin.is_some() {
                return Err(Error::Invalido("un «no hay» no lleva tiempos".into()));
            }
        }
        "si" => {
            let (Some(inicio), Some(fin)) = (finito(fila.inicio), finito(fila.fin)) else {
                return Err(Error::Invalido("el tramo necesita inicio y fin numéricos".into()));
            };
            // +2 s de margen: la duración se guarda redondeada y el fin se validó contra la real.
            if inicio < 0.0 || inicio >= fin || fin > fila.duracion_s as f64 + 2.0 {
                return Err(Error::Invalido("el tramo se sale del episodio".into()));
            }
            if !(MIN_TRAMO_S..=MAX_TRAMO_S).contains(&(fin - inicio)) {
                return Err(Error::Invalido("el tramo dura demasiado poco o demasiado".into()));
            }
        }
        _ => return Err(Error::Invalido("estado de intro inválido".into())),
    }
    conn.execute(
        "INSERT INTO intro_tiempos (mal_id, episodio, duracion_s, estado, inicio, fin, consultado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(mal_id, episodio, duracion_s) DO UPDATE SET estado = excluded.estado,
             inicio = excluded.inicio, fin = excluded.fin, consultado_en = excluded.consultado_en",
        params![fila.mal_id, fila.episodio, fila.duracion_s, fila.estado, fila.inicio, fila.fin, ahora_ms],
    )?;
    Ok(())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    const DIA_MS: i64 = 24 * 3600 * 1000;

    fn si() -> FilaIntro {
        FilaIntro { mal_id: 1535, episodio: 1, duracion_s: 1377, estado: "si".into(), inicio: Some(1.0), fin: Some(91.0) }
    }

    fn no() -> FilaIntro {
        FilaIntro { mal_id: 1535, episodio: 2, duracion_s: 1377, estado: "no".into(), inicio: None, fin: None }
    }

    #[test]
    fn guarda_y_lee_un_tramo_y_un_no_hay() {
        let conn = abrir_en_memoria().unwrap();
        assert_eq!(leer(&conn, 1535, 1, 1377, 0).unwrap(), None);
        guardar(&conn, &si(), 1_000).unwrap();
        guardar(&conn, &no(), 1_000).unwrap();
        assert_eq!(leer(&conn, 1535, 1, 1377, 2_000).unwrap(), Some(si()));
        assert_eq!(leer(&conn, 1535, 2, 1377, 2_000).unwrap(), Some(no()));
        // Otra duración es otro corte: otra fila.
        assert_eq!(leer(&conn, 1535, 1, 1450, 2_000).unwrap(), None);
    }

    #[test]
    fn guardar_de_nuevo_reemplaza_la_fila() {
        let conn = abrir_en_memoria().unwrap();
        guardar(&conn, &no(), 1_000).unwrap();
        let ahora_si = FilaIntro { estado: "si".into(), inicio: Some(5.0), fin: Some(95.0), ..no() };
        guardar(&conn, &ahora_si, 2_000).unwrap();
        assert_eq!(leer(&conn, 1535, 2, 1377, 3_000).unwrap(), Some(ahora_si));
    }

    #[test]
    fn un_no_hay_caduca_a_los_7_dias_y_un_tramo_a_los_30() {
        let conn = abrir_en_memoria().unwrap();
        guardar(&conn, &no(), 0).unwrap();
        guardar(&conn, &si(), 0).unwrap();
        assert!(leer(&conn, 1535, 2, 1377, 7 * DIA_MS).unwrap().is_some(), "justo en el límite aún vale");
        assert!(leer(&conn, 1535, 2, 1377, 7 * DIA_MS + 1).unwrap().is_none());
        assert!(leer(&conn, 1535, 1, 1377, 30 * DIA_MS).unwrap().is_some());
        assert!(leer(&conn, 1535, 1, 1377, 30 * DIA_MS + 1).unwrap().is_none());
    }

    #[test]
    fn rechaza_valores_fuera_de_rango_sin_escribir() {
        let conn = abrir_en_memoria().unwrap();
        let malas = [
            FilaIntro { mal_id: 0, ..si() },
            FilaIntro { episodio: -1, ..si() },
            FilaIntro { duracion_s: 0, ..si() },
            FilaIntro { estado: "quizá".into(), ..si() },
            FilaIntro { inicio: None, ..si() },
            FilaIntro { fin: None, ..si() },
            FilaIntro { inicio: Some(f64::NAN), ..si() },
            FilaIntro { fin: Some(f64::INFINITY), ..si() },
            FilaIntro { inicio: Some(-1.0), ..si() },
            FilaIntro { inicio: Some(90.0), fin: Some(10.0), ..si() },
            FilaIntro { inicio: Some(10.0), fin: Some(12.0), ..si() },    // < 5 s
            FilaIntro { inicio: Some(10.0), fin: Some(400.0), ..si() },   // > 300 s
            FilaIntro { inicio: Some(10.0), fin: Some(1500.0), ..si() },  // se sale del episodio
            FilaIntro { inicio: Some(1.0), ..no() },                      // un «no» no lleva tiempos
        ];
        for mala in &malas {
            assert!(matches!(guardar(&conn, mala, 0), Err(Error::Invalido(_))), "{mala:?}");
        }
        let filas: i64 = conn.query_row("SELECT COUNT(*) FROM intro_tiempos", [], |f| f.get(0)).unwrap();
        assert_eq!(filas, 0);
    }

    #[test]
    fn acepta_un_fin_dos_segundos_por_encima_de_la_duracion_redondeada() {
        // La duración se guarda redondeada: 1377,4 s se guarda como 1377 y un fin de 1378,4 debe pasar.
        let conn = abrir_en_memoria().unwrap();
        let justo = FilaIntro { inicio: Some(1300.0), fin: Some(1379.0), ..si() };
        guardar(&conn, &justo, 0).unwrap();
        let pasado = FilaIntro { episodio: 9, inicio: Some(1300.0), fin: Some(1379.5), ..si() };
        assert!(guardar(&conn, &pasado, 0).is_err());
    }
}
