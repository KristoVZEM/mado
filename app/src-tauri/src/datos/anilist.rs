//! Datos de AniList: caché de obras, vínculo con las series del usuario y agenda de emisión.
//! Las horas de emisión van en segundos (como AniList); `actualizado`, en milisegundos.

use super::progreso::{registrar_anime_sin_pisar, validar_serie, Serie};
use super::{Error, Resultado};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const MAX_TEXTO: usize = 500;
pub(super) const MAX_SINOPSIS: usize = 20_000;
const MAX_URL: usize = 2000;
pub(super) const MAX_LISTA: usize = 200;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relacion {
    pub anilist_id: i64,
    pub tipo: String,
    pub titulo: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaAnilist {
    pub anilist_id: i64,
    pub mal_id: Option<i64>,
    pub titulo_romaji: String,
    pub titulo_ingles: Option<String>,
    pub titulo_nativo: Option<String>,
    pub sinopsis: Option<String>,
    pub generos: Vec<String>,
    pub formato: Option<String>,
    pub estudio: Option<String>,
    pub puntuacion: Option<i64>,
    pub episodios: Option<i64>,
    pub estado: Option<String>,
    pub portada: Option<String>,
    pub banner: Option<String>,
    pub siguiente_ep: Option<i64>,
    pub siguiente_en: Option<i64>,
    pub relaciones: Vec<Relacion>,
    pub sinonimos: Vec<String>,
    pub anio: Option<i64>,
    /// Lo pone Rust al guardar (milisegundos); lo que llegue de fuera se ignora.
    #[serde(default)]
    pub actualizado: i64,
}

fn texto_ok(campo: &str, v: &str, max: usize) -> Resultado<()> {
    if v.chars().count() > max {
        return Err(Error::Invalido(format!("{campo} demasiado largo (máximo {max} caracteres)")));
    }
    Ok(())
}

fn opcional_ok(campo: &str, v: &Option<String>, max: usize) -> Resultado<()> {
    v.as_deref().map_or(Ok(()), |t| texto_ok(campo, t, max))
}

fn url_ok(campo: &str, v: &Option<String>) -> Resultado<()> {
    match v.as_deref() {
        Some(u) if !u.starts_with("https://") || u.len() > MAX_URL => {
            Err(Error::Invalido(format!("{campo}: se espera una URL https de hasta {MAX_URL} caracteres")))
        }
        _ => Ok(()),
    }
}

fn lista_ok(campo: &str, v: &[String]) -> Resultado<()> {
    if v.len() > MAX_LISTA {
        return Err(Error::Invalido(format!("{campo}: demasiados elementos (máximo {MAX_LISTA})")));
    }
    v.iter().try_for_each(|t| texto_ok(campo, t, MAX_TEXTO))
}

fn validar_media(m: &MediaAnilist) -> Resultado<()> {
    if m.anilist_id <= 0 {
        return Err(Error::Invalido("anilist_id debe ser positivo".into()));
    }
    if m.titulo_romaji.trim().is_empty() {
        return Err(Error::Invalido("la obra no tiene título".into()));
    }
    texto_ok("titulo_romaji", &m.titulo_romaji, MAX_TEXTO)?;
    opcional_ok("titulo_ingles", &m.titulo_ingles, MAX_TEXTO)?;
    opcional_ok("titulo_nativo", &m.titulo_nativo, MAX_TEXTO)?;
    opcional_ok("sinopsis", &m.sinopsis, MAX_SINOPSIS)?;
    opcional_ok("formato", &m.formato, MAX_TEXTO)?;
    opcional_ok("estudio", &m.estudio, MAX_TEXTO)?;
    opcional_ok("estado", &m.estado, MAX_TEXTO)?;
    url_ok("portada", &m.portada)?;
    url_ok("banner", &m.banner)?;
    lista_ok("generos", &m.generos)?;
    lista_ok("sinonimos", &m.sinonimos)?;
    if m.relaciones.len() > MAX_LISTA {
        return Err(Error::Invalido(format!("relaciones: demasiados elementos (máximo {MAX_LISTA})")));
    }
    for r in &m.relaciones {
        texto_ok("relacion.tipo", &r.tipo, MAX_TEXTO)?;
        texto_ok("relacion.titulo", &r.titulo, MAX_TEXTO)?;
    }
    Ok(())
}

fn json<T: Serialize + ?Sized>(v: &T) -> Resultado<String> {
    serde_json::to_string(v).map_err(|e| Error::Invalido(e.to_string()))
}

/// Guarda (o actualiza) una obra de AniList. `ahora` en milisegundos.
pub fn guardar_media(conn: &Connection, ahora: i64, m: &MediaAnilist) -> Resultado<()> {
    validar_media(m)?;
    conn.execute(
        "INSERT INTO anilist_media (anilist_id, mal_id, titulo_romaji, titulo_ingles, titulo_nativo, sinopsis,
             generos, formato, estudio, puntuacion, episodios, estado, portada, banner, siguiente_ep,
             siguiente_en, relaciones, sinonimos, anio, actualizado)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
         ON CONFLICT(anilist_id) DO UPDATE SET
             mal_id = excluded.mal_id, titulo_romaji = excluded.titulo_romaji,
             titulo_ingles = excluded.titulo_ingles, titulo_nativo = excluded.titulo_nativo,
             sinopsis = excluded.sinopsis, generos = excluded.generos, formato = excluded.formato,
             estudio = excluded.estudio, puntuacion = excluded.puntuacion, episodios = excluded.episodios,
             estado = excluded.estado, portada = excluded.portada, banner = excluded.banner,
             siguiente_ep = excluded.siguiente_ep, siguiente_en = excluded.siguiente_en,
             relaciones = excluded.relaciones, sinonimos = excluded.sinonimos, anio = excluded.anio,
             actualizado = excluded.actualizado",
        params![
            m.anilist_id,
            m.mal_id,
            m.titulo_romaji,
            m.titulo_ingles,
            m.titulo_nativo,
            m.sinopsis,
            json(&m.generos)?,
            m.formato,
            m.estudio,
            m.puntuacion,
            m.episodios,
            m.estado,
            m.portada,
            m.banner,
            m.siguiente_ep,
            m.siguiente_en,
            json(&m.relaciones)?,
            json(&m.sinonimos)?,
            m.anio,
            ahora,
        ],
    )?;
    Ok(())
}

/// Columnas de `anilist_media` con alias `m`, en el orden que lee `fila_media`.
pub(super) const COLS_MEDIA: &str = "m.anilist_id, m.mal_id, m.titulo_romaji, m.titulo_ingles, m.titulo_nativo,
    m.sinopsis, m.generos, m.formato, m.estudio, m.puntuacion, m.episodios, m.estado, m.portada, m.banner,
    m.siguiente_ep, m.siguiente_en, m.relaciones, m.sinonimos, m.anio, m.actualizado";

/// Lee una obra a partir de la columna `desde` (para consultas con `JOIN` que antepongan otras columnas).
pub(super) fn fila_media(f: &rusqlite::Row, desde: usize) -> rusqlite::Result<MediaAnilist> {
    let lista = |i: usize| -> rusqlite::Result<String> { f.get(desde + i) };
    Ok(MediaAnilist {
        anilist_id: f.get(desde)?,
        mal_id: f.get(desde + 1)?,
        titulo_romaji: f.get(desde + 2)?,
        titulo_ingles: f.get(desde + 3)?,
        titulo_nativo: f.get(desde + 4)?,
        sinopsis: f.get(desde + 5)?,
        generos: serde_json::from_str(&lista(6)?).unwrap_or_default(),
        formato: f.get(desde + 7)?,
        estudio: f.get(desde + 8)?,
        puntuacion: f.get(desde + 9)?,
        episodios: f.get(desde + 10)?,
        estado: f.get(desde + 11)?,
        portada: f.get(desde + 12)?,
        banner: f.get(desde + 13)?,
        siguiente_ep: f.get(desde + 14)?,
        siguiente_en: f.get(desde + 15)?,
        relaciones: serde_json::from_str(&lista(16)?).unwrap_or_default(),
        sinonimos: serde_json::from_str(&lista(17)?).unwrap_or_default(),
        anio: f.get(desde + 18)?,
        actualizado: f.get(desde + 19)?,
    })
}

pub fn leer_media(conn: &Connection, anilist_id: i64) -> Resultado<Option<MediaAnilist>> {
    let sql = format!("SELECT {COLS_MEDIA} FROM anilist_media m WHERE m.anilist_id = ?1");
    Ok(conn.query_row(&sql, params![anilist_id], |f| fila_media(f, 0)).optional()?)
}

const MES_MS: i64 = 30 * 24 * 60 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Vinculo {
    pub aid: i64,
    pub anilist_id: Option<i64>,
    pub confianza: f64,
    /// `auto`, `manual` o `ninguno`.
    pub origen: String,
    pub actualizado: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VinculoConMedia {
    pub vinculo: Vinculo,
    pub media: Option<MediaAnilist>,
}

/// Crea o cambia el vínculo de una serie. Devuelve `false` (sin escribir) si ya hay uno `manual` y el
/// nuevo no lo es: lo que el usuario corrigió a mano no se pisa.
pub fn fijar_vinculo(
    conn: &Connection,
    ahora: i64,
    serie: &Serie,
    anilist_id: Option<i64>,
    confianza: f64,
    origen: &str,
) -> Resultado<bool> {
    validar_serie(serie)?;
    if !matches!(origen, "auto" | "manual" | "ninguno") {
        return Err(Error::Invalido(format!("origen inválido: {origen}")));
    }
    if (origen == "ninguno") != anilist_id.is_none() {
        return Err(Error::Invalido("un vínculo 'ninguno' no lleva obra y los demás sí".into()));
    }
    if !confianza.is_finite() || !(0.0..=1.0).contains(&confianza) {
        return Err(Error::Invalido("la confianza debe estar entre 0 y 1".into()));
    }
    let tx = conn.unchecked_transaction()?;
    let actual: Option<String> = tx
        .query_row("SELECT origen FROM anilist_vinculo WHERE aid = ?1", params![serie.aid], |f| f.get(0))
        .optional()?;
    if actual.as_deref() == Some("manual") && origen != "manual" {
        return Ok(false);
    }
    registrar_anime_sin_pisar(&tx, serie)?;
    tx.execute(
        "INSERT INTO anilist_vinculo (aid, anilist_id, confianza, origen, actualizado)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(aid) DO UPDATE SET anilist_id = excluded.anilist_id, confianza = excluded.confianza,
             origen = excluded.origen, actualizado = excluded.actualizado",
        params![serie.aid, anilist_id, confianza, origen, ahora],
    )?;
    tx.commit()?;
    Ok(true)
}

pub fn vinculo_con_media(conn: &Connection, aid: i64) -> Resultado<Option<VinculoConMedia>> {
    let sql = format!(
        "SELECT v.aid, v.anilist_id, v.confianza, v.origen, v.actualizado, {COLS_MEDIA}
         FROM anilist_vinculo v LEFT JOIN anilist_media m ON m.anilist_id = v.anilist_id
         WHERE v.aid = ?1"
    );
    Ok(conn
        .query_row(&sql, params![aid], |f| {
            let vinculo = Vinculo {
                aid: f.get(0)?,
                anilist_id: f.get(1)?,
                confianza: f.get(2)?,
                origen: f.get(3)?,
                actualizado: f.get(4)?,
            };
            let media = if vinculo.anilist_id.is_some() { Some(fila_media(f, 5)?) } else { None };
            Ok(VinculoConMedia { vinculo, media })
        })
        .optional()?)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendienteEmparejar {
    pub aid: i64,
    pub slug: String,
    pub titulo: String,
    /// 0 = la sigues (`siguiendo`), 1 = favorita, 2 = el resto.
    pub prioridad: u8,
}

/// Series por emparejar: sin vínculo, o con uno `ninguno` de hace más de 30 días.
pub fn pendientes_emparejar(conn: &Connection, ahora: i64, limite: u32) -> Resultado<Vec<PendienteEmparejar>> {
    let mut st = conn.prepare(
        "SELECT a.aid, a.slug, a.titulo,
                CASE WHEN s.aid IS NOT NULL THEN 0 WHEN f.aid IS NOT NULL THEN 1 ELSE 2 END AS prioridad
         FROM anime a
         LEFT JOIN anilist_vinculo v ON v.aid = a.aid
         LEFT JOIN siguiendo s ON s.aid = a.aid
         LEFT JOIN favoritos f ON f.aid = a.aid
         WHERE v.aid IS NULL OR (v.origen = 'ninguno' AND v.actualizado < ?1)
         ORDER BY prioridad, a.aid
         LIMIT ?2",
    )?;
    let filas = st.query_map(params![ahora - MES_MS, limite], |f| {
        Ok(PendienteEmparejar { aid: f.get(0)?, slug: f.get(1)?, titulo: f.get(2)?, prioridad: f.get(3)? })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

const MAX_ITEMS_EMISION: usize = 2000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEmision {
    pub anilist_id: i64,
    pub episodio: i64,
    /// Segundos desde 1970 (como AniList).
    pub emite_en: i64,
}

/// Sustituye la agenda de `[desde, hasta)` (segundos) y guarda las obras que la acompañan, todo en una
/// transacción: si algo es inválido no cambia nada.
pub fn guardar_emision(
    conn: &Connection,
    ahora: i64,
    desde: i64,
    hasta: i64,
    medias: &[MediaAnilist],
    items: &[ItemEmision],
) -> Resultado<()> {
    if desde >= hasta {
        return Err(Error::Invalido("el rango de la agenda está invertido".into()));
    }
    if items.len() > MAX_ITEMS_EMISION || medias.len() > MAX_ITEMS_EMISION {
        return Err(Error::Invalido(format!("agenda demasiado grande (máximo {MAX_ITEMS_EMISION})")));
    }
    for i in items {
        if i.episodio <= 0 || i.emite_en < desde || i.emite_en >= hasta {
            return Err(Error::Invalido("un episodio de la agenda es inválido o cae fuera del rango".into()));
        }
    }
    let tx = conn.unchecked_transaction()?;
    for m in medias {
        guardar_media(&tx, ahora, m)?;
    }
    tx.execute("DELETE FROM anilist_emision WHERE emite_en >= ?1 AND emite_en < ?2", params![desde, hasta])?;
    for i in items {
        tx.execute(
            "INSERT INTO anilist_emision (anilist_id, episodio, emite_en) VALUES (?1, ?2, ?3)
             ON CONFLICT(anilist_id, episodio) DO UPDATE SET emite_en = excluded.emite_en",
            params![i.anilist_id, i.episodio, i.emite_en],
        )?;
    }
    tx.commit()?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaEmision {
    pub anilist_id: i64,
    pub episodio: i64,
    pub emite_en: i64,
    pub titulo_romaji: String,
    pub titulo_ingles: Option<String>,
    pub portada: Option<String>,
    pub banner: Option<String>,
    pub formato: Option<String>,
    pub sinonimos: Vec<String>,
    /// Una serie tuya vinculada a esta obra (la de menor `aid`), si la hay.
    pub aid: Option<i64>,
    pub slug: Option<String>,
    pub titulo_serie: Option<String>,
    /// El menor estado de `siguiendo` entre las series vinculadas (1 = Viendo), si lo hay.
    pub estado: Option<u8>,
}

pub fn emision_entre(conn: &Connection, desde: i64, hasta: i64) -> Resultado<Vec<EntradaEmision>> {
    let mut st = conn.prepare(
        "SELECT t.anilist_id, t.episodio, t.emite_en, t.titulo_romaji, t.titulo_ingles, t.portada, t.banner,
                t.formato, t.sinonimos, t.aid, a.slug, a.titulo, t.estado
         FROM (
             SELECT e.anilist_id, e.episodio, e.emite_en, m.titulo_romaji, m.titulo_ingles, m.portada,
                    m.banner, m.formato, m.sinonimos, MIN(v.aid) AS aid, MIN(s.estado) AS estado
             FROM anilist_emision e
             JOIN anilist_media m ON m.anilist_id = e.anilist_id
             LEFT JOIN anilist_vinculo v ON v.anilist_id = e.anilist_id
             LEFT JOIN siguiendo s ON s.aid = v.aid
             WHERE e.emite_en >= ?1 AND e.emite_en < ?2
             GROUP BY e.anilist_id, e.episodio
         ) t
         LEFT JOIN anime a ON a.aid = t.aid
         ORDER BY t.emite_en, t.anilist_id",
    )?;
    let filas = st.query_map(params![desde, hasta], |f| {
        Ok(EntradaEmision {
            anilist_id: f.get(0)?,
            episodio: f.get(1)?,
            emite_en: f.get(2)?,
            titulo_romaji: f.get(3)?,
            titulo_ingles: f.get(4)?,
            portada: f.get(5)?,
            banner: f.get(6)?,
            formato: f.get(7)?,
            sinonimos: serde_json::from_str(&f.get::<_, String>(8)?).unwrap_or_default(),
            aid: f.get(9)?,
            slug: f.get(10)?,
            titulo_serie: f.get(11)?,
            estado: f.get(12)?,
        })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

/// Lo que Inicio y Biblioteca necesitan de cada serie vinculada (banner y estado de emisión).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumenSerie {
    pub aid: i64,
    pub anilist_id: i64,
    pub confianza: f64,
    pub origen: String,
    pub banner: Option<String>,
    pub portada: Option<String>,
    pub siguiente_ep: Option<i64>,
    pub siguiente_en: Option<i64>,
    pub episodios: Option<i64>,
    pub estado: Option<String>,
}

pub fn resumenes_vinculados(conn: &Connection) -> Resultado<Vec<ResumenSerie>> {
    let mut st = conn.prepare(
        "SELECT v.aid, v.anilist_id, v.confianza, v.origen, m.banner, m.portada, m.siguiente_ep,
                m.siguiente_en, m.episodios, m.estado
         FROM anilist_vinculo v JOIN anilist_media m ON m.anilist_id = v.anilist_id
         ORDER BY v.aid",
    )?;
    let filas = st.query_map([], |f| {
        Ok(ResumenSerie {
            aid: f.get(0)?,
            anilist_id: f.get(1)?,
            confianza: f.get(2)?,
            origen: f.get(3)?,
            banner: f.get(4)?,
            portada: f.get(5)?,
            siguiente_ep: f.get(6)?,
            siguiente_en: f.get(7)?,
            episodios: f.get(8)?,
            estado: f.get(9)?,
        })
    })?;
    Ok(filas.collect::<Result<Vec<_>, _>>()?)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::datos::abrir_en_memoria;

    pub(super) fn media(id: i64, titulo: &str) -> MediaAnilist {
        MediaAnilist { anilist_id: id, titulo_romaji: titulo.into(), ..Default::default() }
    }

    #[test]
    fn guardar_y_leer_una_obra_completa() {
        let conn = abrir_en_memoria().unwrap();
        let m = MediaAnilist {
            anilist_id: 154587,
            mal_id: Some(52991),
            titulo_romaji: "Sousou no Frieren".into(),
            titulo_ingles: Some("Frieren: Beyond Journey's End".into()),
            titulo_nativo: Some("葬送のフリーレン".into()),
            sinopsis: Some("Texto".into()),
            generos: vec!["Aventura".into(), "Drama".into()],
            formato: Some("TV".into()),
            estudio: Some("Madhouse".into()),
            puntuacion: Some(91),
            episodios: Some(28),
            estado: Some("FINISHED".into()),
            portada: Some("https://s4.anilist.co/c.jpg".into()),
            banner: Some("https://s4.anilist.co/b.jpg".into()),
            siguiente_ep: Some(29),
            siguiente_en: Some(1_800_000_000),
            relaciones: vec![Relacion { anilist_id: 2, tipo: "SEQUEL".into(), titulo: "Frieren 2".into() }],
            sinonimos: vec!["Frieren en el funeral".into()],
            anio: Some(2023),
            actualizado: 0,
        };
        guardar_media(&conn, 5000, &m).unwrap();
        let leida = leer_media(&conn, 154587).unwrap().unwrap();
        assert_eq!(leida, MediaAnilist { actualizado: 5000, ..m });
        assert_eq!(leer_media(&conn, 1).unwrap(), None);
    }

    #[test]
    fn guardar_de_nuevo_actualiza_en_vez_de_duplicar() {
        let conn = abrir_en_memoria().unwrap();
        guardar_media(&conn, 1, &media(7, "Uno")).unwrap();
        let mut m = media(7, "Dos");
        m.puntuacion = Some(50);
        guardar_media(&conn, 2, &m).unwrap();
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM anilist_media", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 1);
        let l = leer_media(&conn, 7).unwrap().unwrap();
        assert_eq!((l.titulo_romaji.as_str(), l.puntuacion, l.actualizado), ("Dos", Some(50), 2));
    }

    #[test]
    fn rechaza_obras_invalidas_y_no_guarda_nada() {
        let conn = abrir_en_memoria().unwrap();
        assert!(guardar_media(&conn, 1, &media(0, "X")).is_err(), "id 0");
        assert!(guardar_media(&conn, 1, &media(-3, "X")).is_err(), "id negativo");
        assert!(guardar_media(&conn, 1, &media(1, "  ")).is_err(), "sin título");
        let mut largo = media(1, "X");
        largo.sinopsis = Some("a".repeat(MAX_SINOPSIS + 1));
        assert!(guardar_media(&conn, 1, &largo).is_err(), "sinopsis enorme");
        let mut url = media(1, "X");
        url.banner = Some("http://inseguro/x.jpg".into());
        assert!(guardar_media(&conn, 1, &url).is_err(), "URL que no es https");
        let mut lista = media(1, "X");
        lista.generos = vec!["g".into(); MAX_LISTA + 1];
        assert!(guardar_media(&conn, 1, &lista).is_err(), "lista enorme");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM anilist_media", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    const SERIE: Serie<'static> = Serie { aid: 1, slug: "a", titulo: "A" };
    const MES_MS: i64 = 30 * 24 * 60 * 60 * 1000;

    fn con_obra(conn: &Connection, id: i64) {
        guardar_media(conn, 1, &media(id, "Obra")).unwrap();
    }

    #[test]
    fn fijar_y_leer_un_vinculo_con_su_obra() {
        let conn = abrir_en_memoria().unwrap();
        con_obra(&conn, 10);
        assert!(fijar_vinculo(&conn, 100, &SERIE, Some(10), 0.9, "auto").unwrap());
        let v = vinculo_con_media(&conn, 1).unwrap().unwrap();
        assert_eq!(v.vinculo.anilist_id, Some(10));
        assert_eq!(v.vinculo.origen, "auto");
        assert_eq!(v.vinculo.actualizado, 100);
        assert_eq!(v.media.unwrap().titulo_romaji, "Obra");
        assert_eq!(vinculo_con_media(&conn, 2).unwrap(), None);
    }

    #[test]
    fn un_vinculo_ninguno_no_trae_obra() {
        let conn = abrir_en_memoria().unwrap();
        assert!(fijar_vinculo(&conn, 5, &SERIE, None, 0.2, "ninguno").unwrap());
        let v = vinculo_con_media(&conn, 1).unwrap().unwrap();
        assert_eq!((v.vinculo.origen.as_str(), v.vinculo.anilist_id), ("ninguno", None));
        assert!(v.media.is_none());
    }

    #[test]
    fn el_vinculo_manual_no_se_pisa_con_auto_ni_con_ninguno() {
        let conn = abrir_en_memoria().unwrap();
        con_obra(&conn, 10);
        con_obra(&conn, 11);
        assert!(fijar_vinculo(&conn, 1, &SERIE, Some(10), 1.0, "manual").unwrap());
        assert!(!fijar_vinculo(&conn, 2, &SERIE, Some(11), 0.95, "auto").unwrap());
        assert!(!fijar_vinculo(&conn, 3, &SERIE, None, 0.1, "ninguno").unwrap());
        let v = vinculo_con_media(&conn, 1).unwrap().unwrap().vinculo;
        assert_eq!((v.anilist_id, v.origen.as_str(), v.actualizado), (Some(10), "manual", 1));
        // Otro manual sí sustituye al manual.
        assert!(fijar_vinculo(&conn, 4, &SERIE, Some(11), 1.0, "manual").unwrap());
        assert_eq!(vinculo_con_media(&conn, 1).unwrap().unwrap().vinculo.anilist_id, Some(11));
    }

    #[test]
    fn fijar_vinculo_rechaza_datos_incoherentes() {
        let conn = abrir_en_memoria().unwrap();
        con_obra(&conn, 10);
        assert!(fijar_vinculo(&conn, 1, &SERIE, Some(10), 0.5, "raro").is_err(), "origen");
        assert!(fijar_vinculo(&conn, 1, &SERIE, None, 0.5, "auto").is_err(), "auto sin obra");
        assert!(fijar_vinculo(&conn, 1, &SERIE, Some(10), 0.5, "ninguno").is_err(), "ninguno con obra");
        assert!(fijar_vinculo(&conn, 1, &SERIE, Some(99), 0.5, "auto").is_err(), "obra desconocida");
        for mala in [f64::NAN, -0.1, 1.1] {
            assert!(fijar_vinculo(&conn, 1, &SERIE, Some(10), mala, "auto").is_err(), "{mala}");
        }
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM anilist_vinculo", [], |f| f.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn pendientes_ordena_por_prioridad_y_respeta_el_reintento_de_30_dias() {
        let conn = abrir_en_memoria().unwrap();
        for (aid, slug) in [(1, "uno"), (2, "dos"), (3, "tres"), (4, "cuatro"), (5, "cinco"), (6, "seis")] {
            conn.execute("INSERT INTO anime VALUES (?1, ?2, ?2)", params![aid, slug]).unwrap();
        }
        conn.execute("INSERT INTO favoritos VALUES (2, NULL)", []).unwrap();
        conn.execute("INSERT INTO siguiendo VALUES (3, 1)", []).unwrap();
        con_obra(&conn, 10);
        let ahora = 100 * MES_MS;
        let s = |aid: i64, slug: &'static str| Serie { aid, slug, titulo: slug };
        fijar_vinculo(&conn, ahora, &s(4, "cuatro"), Some(10), 0.9, "auto").unwrap(); // ya vinculada
        fijar_vinculo(&conn, ahora - MES_MS - 1, &s(5, "cinco"), None, 0.1, "ninguno").unwrap(); // reintento
        fijar_vinculo(&conn, ahora - 1000, &s(6, "seis"), None, 0.1, "ninguno").unwrap(); // reciente
        let p = pendientes_emparejar(&conn, ahora, 10).unwrap();
        let orden: Vec<(i64, u8)> = p.iter().map(|x| (x.aid, x.prioridad)).collect();
        assert_eq!(orden, vec![(3, 0), (2, 1), (1, 2), (5, 2)]);
        assert_eq!(pendientes_emparejar(&conn, ahora, 2).unwrap().len(), 2);
    }

    #[test]
    fn fijar_vinculo_registra_la_serie_sin_pisar_el_titulo() {
        let conn = abrir_en_memoria().unwrap();
        conn.execute("INSERT INTO anime VALUES (1, 'a', 'Título bueno')", []).unwrap();
        let otra = Serie { aid: 1, slug: "a", titulo: "Otro" };
        fijar_vinculo(&conn, 1, &otra, None, 0.1, "ninguno").unwrap();
        let t: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 1", [], |f| f.get(0)).unwrap();
        assert_eq!(t, "Título bueno");
    }

    fn item(id: i64, ep: i64, cuando: i64) -> ItemEmision {
        ItemEmision { anilist_id: id, episodio: ep, emite_en: cuando }
    }

    #[test]
    fn guardar_emision_reemplaza_solo_el_rango_indicado() {
        let conn = abrir_en_memoria().unwrap();
        guardar_emision(&conn, 1, 100, 200, &[media(1, "A"), media(2, "B")], &[item(1, 5, 150), item(2, 3, 120)])
            .unwrap();
        guardar_emision(&conn, 2, 300, 400, &[media(3, "C")], &[item(3, 1, 350)]).unwrap();
        // Se vuelve a cargar la primera semana con un solo episodio.
        guardar_emision(&conn, 3, 100, 200, &[media(1, "A")], &[item(1, 5, 160)]).unwrap();
        let todo = emision_entre(&conn, 0, 1000).unwrap();
        let claves: Vec<(i64, i64, i64)> = todo.iter().map(|e| (e.anilist_id, e.episodio, e.emite_en)).collect();
        assert_eq!(claves, vec![(1, 5, 160), (3, 1, 350)]);
    }

    #[test]
    fn guardar_emision_es_atomica_si_algo_es_invalido() {
        let conn = abrir_en_memoria().unwrap();
        guardar_emision(&conn, 1, 100, 200, &[media(1, "A")], &[item(1, 5, 150)]).unwrap();
        let malos: Vec<(Vec<MediaAnilist>, Vec<ItemEmision>)> = vec![
            (vec![media(2, "B")], vec![item(9, 1, 150)]), // obra desconocida
            (vec![media(2, "B")], vec![item(2, 0, 150)]), // episodio 0
            (vec![media(2, "B")], vec![item(2, 1, 99)]),  // fuera del rango
            (vec![media(2, "B")], vec![item(2, 1, 200)]), // el límite superior es exclusivo
            (vec![media(0, "B")], vec![]),                // obra inválida
        ];
        for (medias, items) in &malos {
            assert!(guardar_emision(&conn, 2, 100, 200, medias, items).is_err());
        }
        assert!(guardar_emision(&conn, 2, 200, 100, &[], &[]).is_err(), "rango invertido");
        let todo = emision_entre(&conn, 0, 1000).unwrap();
        assert_eq!(todo.len(), 1, "la agenda previa sigue intacta");
        assert!(leer_media(&conn, 2).unwrap().is_none(), "la obra del intento fallido no se guardó");
    }

    #[test]
    fn emision_entre_marca_la_serie_vinculada_y_su_estado_sin_duplicar_filas() {
        let conn = abrir_en_memoria().unwrap();
        guardar_emision(&conn, 1, 0, 1000, &[media(10, "Obra")], &[item(10, 2, 500)]).unwrap();
        let s = |aid: i64, slug: &'static str| Serie { aid, slug, titulo: slug };
        fijar_vinculo(&conn, 1, &s(7, "siete"), Some(10), 0.9, "auto").unwrap();
        fijar_vinculo(&conn, 1, &s(3, "tres"), Some(10), 0.9, "auto").unwrap();
        conn.execute("INSERT INTO siguiendo VALUES (7, 1)", []).unwrap();
        conn.execute("INSERT INTO siguiendo VALUES (3, 4)", []).unwrap();
        let e = emision_entre(&conn, 0, 1000).unwrap();
        assert_eq!(e.len(), 1);
        assert_eq!((e[0].aid, e[0].estado), (Some(3), Some(1)));
        assert_eq!((e[0].slug.as_deref(), e[0].titulo_serie.as_deref()), (Some("tres"), Some("tres")));
    }

    #[test]
    fn emision_de_una_obra_sin_vinculo_no_trae_serie() {
        let conn = abrir_en_memoria().unwrap();
        guardar_emision(&conn, 1, 0, 1000, &[media(10, "Obra")], &[item(10, 2, 500)]).unwrap();
        let e = emision_entre(&conn, 0, 1000).unwrap();
        assert_eq!((e[0].aid, e[0].estado, e[0].slug.clone()), (None, None, None));
        assert!(emision_entre(&conn, 501, 1000).unwrap().is_empty());
    }

    #[test]
    fn resumenes_vinculados_trae_solo_series_con_obra() {
        let conn = abrir_en_memoria().unwrap();
        let mut m = media(10, "Obra");
        m.banner = Some("https://s4.anilist.co/b.jpg".into());
        m.siguiente_ep = Some(8);
        m.siguiente_en = Some(1234);
        guardar_media(&conn, 1, &m).unwrap();
        let s = |aid: i64, slug: &'static str| Serie { aid, slug, titulo: slug };
        fijar_vinculo(&conn, 1, &s(2, "dos"), Some(10), 0.9, "auto").unwrap();
        fijar_vinculo(&conn, 1, &s(1, "uno"), None, 0.1, "ninguno").unwrap();
        let r = resumenes_vinculados(&conn).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!((r[0].aid, r[0].anilist_id, r[0].siguiente_ep, r[0].siguiente_en), (2, 10, Some(8), Some(1234)));
        assert_eq!(r[0].banner.as_deref(), Some("https://s4.anilist.co/b.jpg"));
    }
}
