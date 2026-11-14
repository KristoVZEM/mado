use super::*;
use crate::datos::progreso::{marcar_visto, Serie};
use crate::datos::{abrir, abrir_en_memoria};
use rusqlite::params;
use std::sync::atomic::{AtomicU32, Ordering};

static SECUENCIA: AtomicU32 = AtomicU32::new(0);

/// Sufijo único por prueba: varias corren a la vez en hilos distintos.
fn unico() -> String {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
    format!("{}-{nanos}-{}", std::process::id(), SECUENCIA.fetch_add(1, Ordering::Relaxed))
}

fn json(registros: &str) -> String {
    format!(r#"{{"version":2,"date":"08/11/2026 18:22","data":[{registros}]}}"#)
}

fn visto(aid: i64, numero: &str, fecha: i64) -> String {
    format!(r#"{{"aid":{aid},"date":{fecha},"eid":1,"name":"Serie {aid}","number":{numero},"slug":"serie-{aid}"}}"#)
}

/// Carpeta temporal nueva con los archivos dados.
fn carpeta(archivos: &[(&str, &[u8])]) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("mado-copia-{}", unico()));
    std::fs::create_dir(&dir).unwrap();
    for &(nombre, contenido) in archivos {
        std::fs::write(dir.join(nombre), contenido).unwrap();
    }
    dir
}

fn borrar(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

/// Escribe una carpeta temporal con esos archivos, la lee y la borra.
fn leida(archivos: &[(&str, String)]) -> Carpeta {
    let bytes: Vec<(&str, &[u8])> = archivos.iter().map(|(n, c)| (*n, c.as_bytes())).collect();
    let dir = carpeta(&bytes);
    let c = leer_carpeta(&dir).unwrap();
    borrar(&dir);
    c
}

/// Error al leer una carpeta que solo tiene `nombre` con ese contenido.
fn error_de(nombre: &str, contenido: &[u8]) -> String {
    let dir = carpeta(&[(nombre, contenido)]);
    let err = leer_carpeta(&dir).unwrap_err().to_string();
    borrar(&dir);
    err
}

/// Guardián de una base en disco: al soltarse, aunque la prueba falle, borra la base y todo lo que
/// cuelga de su nombre (wal, shm, `*.bak`, `*.reemplazo*`). Se declara antes que la conexión para
/// soltarse después de cerrarla.
struct BaseTemporal(PathBuf);

impl std::ops::Deref for BaseTemporal {
    type Target = Path;
    fn deref(&self) -> &Path {
        &self.0
    }
}

impl Drop for BaseTemporal {
    fn drop(&mut self) {
        limpiar(&self.0);
    }
}

fn base_en_disco() -> (BaseTemporal, Connection) {
    let ruta = std::env::temp_dir().join(format!("mado-reemplazo-{}.db", unico()));
    let guardian = BaseTemporal(ruta.clone());
    (guardian, abrir(&ruta).unwrap())
}

/// Borra la base y todo lo que cuelga de su nombre (wal, shm, copias, tmp).
fn limpiar(ruta: &Path) {
    let prefijo = ruta.file_name().unwrap().to_string_lossy().into_owned();
    for e in std::fs::read_dir(ruta.parent().unwrap()).unwrap().flatten() {
        if e.file_name().to_string_lossy().starts_with(&prefijo) {
            let _ = std::fs::remove_file(e.path());
            let _ = std::fs::remove_dir(e.path());
        }
    }
}

fn copias(ruta: &Path) -> Vec<PathBuf> {
    let prefijo = format!("{}.reemplazo-", ruta.file_name().unwrap().to_string_lossy());
    std::fs::read_dir(ruta.parent().unwrap())
        .unwrap()
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            n.starts_with(&prefijo) && n.ends_with(".bak")
        })
        .map(|e| e.path())
        .collect()
}

/// Temporales y copias a medias: todo `<db>.reemplazo*` que no sea una copia `.bak` terminada.
fn restos(ruta: &Path) -> Vec<PathBuf> {
    let prefijo = format!("{}.reemplazo", ruta.file_name().unwrap().to_string_lossy());
    std::fs::read_dir(ruta.parent().unwrap())
        .unwrap()
        .flatten()
        .filter(|e| {
            let n = e.file_name().to_string_lossy().into_owned();
            n.starts_with(&prefijo) && !n.ends_with(".bak")
        })
        .map(|e| e.path())
        .collect()
}

fn contar(conn: &Connection, tabla: &str) -> i64 {
    conn.query_row(&format!("SELECT COUNT(*) FROM {tabla}"), [], |f| f.get(0)).unwrap()
}

fn visto_en(conn: &Connection, aid: i64, numero: f64) -> Option<i64> {
    conn.query_row("SELECT visto_en FROM historial WHERE aid = ?1 AND numero = ?2", params![aid, numero], |f| f.get(0))
        .ok()
}

/// Base con un episodio visto (aid 1, ep. 1, fecha 5000, título "Título local"), aid 1 en
/// Viendo y aid 1 favorito con categoría "Vieja".
fn sembrar(conn: &Connection) {
    marcar_visto(conn, 5000, &Serie { aid: 1, slug: "serie-1", titulo: "Título local" }, 1.0, None, &[]).unwrap();
    conn.execute("INSERT INTO siguiendo (aid, estado) VALUES (1, 1)", []).unwrap();
    conn.execute("INSERT INTO favoritos (aid, categoria) VALUES (1, 'Vieja')", []).unwrap();
}

#[test]
fn el_modo_se_lee_de_un_texto_y_rechaza_otros() {
    assert_eq!(Modo::desde_texto("mezclar").unwrap(), Modo::Mezclar);
    assert_eq!(Modo::desde_texto("reemplazar").unwrap(), Modo::Reemplazar);
    assert!(Modo::desde_texto("borrar").is_err());
}

#[test]
fn lee_el_history_de_la_carpeta() {
    let c = leida(&[(HISTORY, json(&format!("{},{}", visto(1, "1.0", 10), visto(1, "2.0", 20))))]);
    assert_eq!(c.historial.unwrap().registros.len(), 2);
    assert!(!c.ausentes.contains(&HISTORY.to_string()));
}

#[test]
fn una_carpeta_sin_ninguno_de_los_archivos_es_error() {
    let dir = carpeta(&[("seen", "{}".as_bytes()), ("autobackup", "{}".as_bytes())]);
    let err = leer_carpeta(&dir).unwrap_err().to_string();
    borrar(&dir);
    assert!(err.contains("ningún archivo"), "{err}");
}

#[test]
fn un_history_presente_e_invalido_es_error_con_su_nombre() {
    for (contenido, pista) in [
        (r#"{"version":3,"data":[]}"#.as_bytes(), "3"),
        ("esto no es json".as_bytes(), "JSON"),
        (r#"{"version":2,"data":[]}"#.as_bytes(), "episodio"),
        ([0xffu8, 0xfe, 0x00].as_slice(), "UTF-8"),
    ] {
        let err = error_de(HISTORY, contenido);
        assert!(err.starts_with("history:") && err.contains(pista), "{err}");
    }
}

#[test]
fn un_directorio_con_el_nombre_de_un_archivo_es_error() {
    let dir = carpeta(&[]);
    std::fs::create_dir(dir.join(HISTORY)).unwrap();
    let err = leer_carpeta(&dir).unwrap_err().to_string();
    borrar(&dir);
    assert!(err.starts_with("history:") && err.contains("no es un archivo"), "{err}");
}

#[test]
fn un_archivo_demasiado_grande_es_error() {
    let grande = vec![b' '; MAX_BYTES as usize + 1];
    let err = error_de(HISTORY, &grande);
    assert!(err.starts_with("history:") && err.contains("demasiado grande"), "{err}");
}

#[test]
fn rechaza_rutas_relativas_inexistentes_y_que_no_son_carpeta() {
    assert!(leer_carpeta(Path::new("copia")).unwrap_err().to_string().contains("absoluta"));
    assert!(leer_carpeta(&std::env::temp_dir().join("mado-copia-no-existe-jamas")).is_err());
    let dir = carpeta(&[(HISTORY, json(&visto(1, "1.0", 10)).as_bytes())]);
    let err = leer_carpeta(&dir.join(HISTORY)).unwrap_err().to_string();
    borrar(&dir);
    assert!(err.contains("no es una carpeta"), "{err}");
}

#[test]
fn rechaza_rutas_de_red_y_de_dispositivo_con_cualquier_separador() {
    for ruta in [
        r"\\host\share\copia",
        "//host/share/copia",
        r"/\host\share\copia",
        r"\\?\UNC\host\share\copia",
        "//?/UNC/host/share/copia",
        r"\\.\pipe\ukiku",
        "//./NUL",
    ] {
        let err = leer_carpeta(Path::new(ruta)).unwrap_err().to_string();
        assert!(err.contains("red"), "{ruta}: {err}");
    }
}

#[cfg(windows)]
#[test]
fn acepta_una_carpeta_de_disco_en_forma_verbatim() {
    let dir = carpeta(&[(HISTORY, json(&visto(8, "1.0", 5)).as_bytes())]);
    let verbatim = PathBuf::from(format!(r"\\?\{}", dir.display()));
    let c = leer_carpeta(&verbatim).unwrap();
    borrar(&dir);
    assert_eq!(c.historial.unwrap().registros[0].aid, 8);
}

#[test]
fn previsualizar_resume_el_history_sin_escribir() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    let c = leida(&[(HISTORY, json(&format!("{},{}", visto(1, "1.0", 100), visto(1, "2.0", 100))))]);
    let r = previsualizar(&conn, &c).unwrap();
    let h = r.historial.as_ref().unwrap();
    assert_eq!((h.total, h.nuevos, h.existentes, h.actuales), (2, 1, 1, 1));
    assert_eq!(r.ausentes, c.ausentes);
    assert_eq!(contar(&conn, "historial"), 1, "la vista previa no escribe");
}

#[test]
fn mezclar_el_history_conserva_la_fecha_mas_reciente_y_no_hace_copia() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    let c = leida(&[(HISTORY, json(&format!("{},{}", visto(1, "1.0", 100), visto(2, "1.0", 300))))]);
    let r = aplicar(&conn, &c, Modo::Mezclar).unwrap();
    assert_eq!(r.historial, Some(Aplicado { nuevos: 1, actualizados: 1, invalidos: 0 }));
    assert_eq!(r.copia, None);
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "lo local es más reciente");
    assert_eq!(visto_en(&conn, 2, 1.0), Some(300));
}

#[test]
fn reemplazar_guarda_una_unica_copia_previa_y_carga_el_history() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let c = leida(&[(HISTORY, json(&visto(2, "1.0", 300)))]);
    let r = aplicar(&conn, &c, Modo::Reemplazar).unwrap();
    assert_eq!(visto_en(&conn, 1, 1.0), None);
    assert_eq!(visto_en(&conn, 2, 1.0), Some(300));
    assert_eq!(contar(&conn, "anime"), 2, "anime nunca se vacía");
    assert_eq!(copias(&ruta).len(), 1);
    let previa = Connection::open(PathBuf::from(r.copia.expect("debe informar la copia"))).unwrap();
    let antes: i64 = previa.query_row("SELECT COUNT(*) FROM historial WHERE aid = 1", [], |f| f.get(0)).unwrap();
    assert_eq!(antes, 1, "la copia es previa al reemplazo");
    drop(previa);
}

#[test]
fn dos_reemplazos_seguidos_dejan_dos_copias_distintas() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let primera = leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]);
    let segunda = leida(&[(HISTORY, json(&visto(3, "1.0", 1)))]);
    let c1 = PathBuf::from(aplicar(&conn, &primera, Modo::Reemplazar).unwrap().copia.unwrap());
    let c2 = PathBuf::from(aplicar(&conn, &segunda, Modo::Reemplazar).unwrap().copia.unwrap());
    assert_ne!(c1, c2);
    assert_eq!(copias(&ruta).len(), 2);
    let de = |copia: &Path, aid: i64| -> i64 {
        Connection::open(copia)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM historial WHERE aid = ?1", [aid], |f| f.get(0))
            .unwrap()
    };
    assert_eq!((de(&c1, 1), de(&c1, 2)), (1, 0), "la primera copia tiene el historial original");
    assert_eq!((de(&c2, 2), de(&c2, 3)), (1, 0), "la segunda es previa al segundo reemplazo");
}

#[test]
fn reemplazar_en_una_base_en_memoria_falla_sin_tocar_nada() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    let r = aplicar(&conn, &leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]), Modo::Reemplazar);
    assert!(r.unwrap_err().to_string().contains("no se reemplaza nada"));
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
}

#[test]
fn si_la_copia_falla_no_se_borra_nada() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    // VACUUM INTO no puede correr dentro de una transacción: la copia previa falla de verdad.
    conn.execute_batch("BEGIN").unwrap();
    assert!(aplicar(&conn, &leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]), Modo::Reemplazar).is_err());
    conn.execute_batch("ROLLBACK").unwrap();
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
    assert!(copias(&ruta).is_empty());
    assert!(restos(&ruta).is_empty(), "no queda ningún temporal");
}

#[test]
fn un_fallo_a_medias_no_deja_cambios() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    conn.execute_batch("DROP TABLE progreso").unwrap();
    let c = leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]);
    assert!(aplicar_interno(&conn, &c, Modo::Reemplazar, false).is_err());
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "el DELETE del historial se deshizo");
    assert_eq!(visto_en(&conn, 2, 1.0), None);
}

fn seguida(aid: i64, estado: u8) -> String {
    format!(r#"{{"aid":{aid},"last_watched":-1,"name":"Serie {aid}","slug":"serie-{aid}","state":{estado}}}"#)
}

fn estado_de(conn: &Connection, aid: i64) -> Option<u8> {
    conn.query_row("SELECT estado FROM siguiendo WHERE aid = ?1", [aid], |f| f.get(0)).ok()
}

#[test]
fn lee_el_following_y_si_falta_el_history_lo_informa() {
    let c = leida(&[(FOLLOWING, json(&seguida(1, 3)))]);
    assert!(c.historial.is_none());
    assert_eq!(c.siguiendo.unwrap().registros[0].estado, 3);
    assert!(c.ausentes.contains(&HISTORY.to_string()));
    assert!(!c.ausentes.contains(&FOLLOWING.to_string()));
}

#[test]
fn un_following_presente_e_invalido_es_error_con_su_nombre() {
    for (contenido, pista) in
        [(r#"{"version":3,"data":[]}"#, "3"), (r#"{"version":2,"data":[{"aid":0}]}"#, "registro"), ("{", "JSON")]
    {
        let err = error_de(FOLLOWING, contenido.as_bytes());
        assert!(err.starts_with("following:") && err.contains(pista), "{err}");
    }
}

#[test]
fn previsualizar_resume_el_following_sin_escribir() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    let c = leida(&[(FOLLOWING, json(&format!("{},{}", seguida(1, 3), seguida(2, 1))))]);
    let r = previsualizar(&conn, &c).unwrap();
    assert_eq!(r.siguiendo, Some(ResumenLista { total: 2, nuevos: 1, existentes: 1, invalidos: 0, actuales: 1 }));
    assert_eq!(r.historial, None);
    assert_eq!(estado_de(&conn, 1), Some(1), "la vista previa no escribe");
}

#[test]
fn mezclar_el_following_gana_el_archivo_y_no_borra_lo_que_no_viene() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    conn.execute_batch("INSERT INTO anime VALUES (9, 'serie-9', 'Serie 9'); INSERT INTO siguiendo (aid, estado) VALUES (9, 5);")
        .unwrap();
    let c = leida(&[(FOLLOWING, json(&format!("{},{}", seguida(1, 3), seguida(2, 4))))]);
    let r = aplicar(&conn, &c, Modo::Mezclar).unwrap();
    assert_eq!(r.siguiendo, Some(Aplicado { nuevos: 1, actualizados: 1, invalidos: 0 }));
    assert_eq!((estado_de(&conn, 1), estado_de(&conn, 2), estado_de(&conn, 9)), (Some(3), Some(4), Some(5)));
    let titulo: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 1", [], |f| f.get(0)).unwrap();
    assert_eq!(titulo, "Título local", "no pisa títulos");
}

#[test]
fn reemplazar_solo_el_following_no_toca_el_historial_ni_anime() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let c = leida(&[(FOLLOWING, json(&seguida(2, 4)))]);
    let r = aplicar(&conn, &c, Modo::Reemplazar).unwrap();
    assert_eq!(r.historial, None);
    assert_eq!((estado_de(&conn, 1), estado_de(&conn, 2)), (None, Some(4)));
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "sin history no se toca el historial");
    assert_eq!(contar(&conn, "anime"), 2);
    assert_eq!(copias(&ruta).len(), 1, "una única copia previa");
}

#[test]
fn un_fallo_en_el_following_deshace_tambien_el_historial() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    conn.execute_batch("DROP TABLE siguiendo").unwrap();
    let c = leida(&[(HISTORY, json(&visto(2, "1.0", 1))), (FOLLOWING, json(&seguida(2, 2)))]);
    assert!(aplicar_interno(&conn, &c, Modo::Reemplazar, false).is_err());
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
    assert_eq!(visto_en(&conn, 2, 1.0), None);
}

fn favorita(aid: i64, categoria: &str) -> String {
    format!(r#"{{"aid":{aid},"category":"{categoria}","name":"Serie {aid}","slug":"serie-{aid}","type":"tv-anime"}}"#)
}

fn categoria_de(conn: &Connection, aid: i64) -> Option<Option<String>> {
    conn.query_row("SELECT categoria FROM favoritos WHERE aid = ?1", [aid], |f| f.get(0)).ok()
}

#[test]
fn informa_los_ausentes_con_uno_dos_y_tres_archivos() {
    let h = (HISTORY, json(&visto(1, "1.0", 10)));
    let s = (FOLLOWING, json(&seguida(1, 1)));
    let f = (FAVS, json(""));
    assert_eq!(leida(std::slice::from_ref(&s)).ausentes, [HISTORY, FAVS]);
    assert_eq!(leida(&[h.clone(), f.clone()]).ausentes, [FOLLOWING]);
    let tres = leida(&[h, s, f]);
    assert!(tres.ausentes.is_empty());
    assert!(tres.historial.is_some() && tres.siguiendo.is_some() && tres.favoritos.is_some());
}

#[test]
fn un_favs_vacio_es_valido() {
    let c = leida(&[(FAVS, json(""))]);
    assert!(c.favoritos.unwrap().registros.is_empty());
}

#[test]
fn un_favs_presente_e_invalido_es_error_con_su_nombre() {
    for (contenido, pista) in [
        (r#"{"version":3,"data":[]}"#.as_bytes(), "3"),
        (r#"{"version":2,"data":[{"aid":0}]}"#.as_bytes(), "registro"),
        ([0xffu8, 0xfe, 0x00].as_slice(), "UTF-8"),
    ] {
        let err = error_de(FAVS, contenido);
        assert!(err.starts_with("favs:") && err.contains(pista), "{err}");
    }
}

#[test]
fn previsualizar_resume_los_favs_sin_escribir() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    let c = leida(&[(FAVS, json(&format!("{},{}", favorita(1, "_NONE_"), favorita(2, "Nueva"))))]);
    let r = previsualizar(&conn, &c).unwrap();
    assert_eq!(r.favoritos, Some(ResumenLista { total: 2, nuevos: 1, existentes: 1, invalidos: 0, actuales: 1 }));
    assert_eq!(categoria_de(&conn, 1), Some(Some("Vieja".into())), "la vista previa no escribe");
}

#[test]
fn mezclar_los_favs_gana_el_archivo_en_la_categoria() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    conn.execute_batch("INSERT INTO anime VALUES (9, 'serie-9', 'Serie 9'); INSERT INTO favoritos VALUES (9, 'Otra');")
        .unwrap();
    let c = leida(&[(FAVS, json(&format!("{},{}", favorita(1, "_NONE_"), favorita(2, "Nueva"))))]);
    let r = aplicar(&conn, &c, Modo::Mezclar).unwrap();
    assert_eq!(r.favoritos, Some(Aplicado { nuevos: 1, actualizados: 1, invalidos: 0 }));
    assert_eq!(categoria_de(&conn, 1), Some(None), "gana el archivo, también sin categoría");
    assert_eq!(categoria_de(&conn, 2), Some(Some("Nueva".into())));
    assert_eq!(categoria_de(&conn, 9), Some(Some("Otra".into())), "mezclar no borra lo que no viene");
    let titulo: String = conn.query_row("SELECT titulo FROM anime WHERE aid = 1", [], |f| f.get(0)).unwrap();
    assert_eq!(titulo, "Título local", "no pisa títulos");
}

#[cfg(windows)]
#[test]
fn un_archivo_que_es_un_enlace_simbolico_se_rechaza() {
    let dir = carpeta(&[("destino", b"{}")]);
    if std::os::windows::fs::symlink_file(dir.join("destino"), dir.join(HISTORY)).is_err() {
        // Sin privilegio para crear enlaces: no se puede probar aquí.
        borrar(&dir);
        return;
    }
    let err = leer_carpeta(&dir).unwrap_err().to_string();
    borrar(&dir);
    assert!(err.starts_with("history:") && err.contains("enlace"), "{err}");
}

#[test]
fn reemplazar_solo_los_favs_no_toca_el_historial_ni_siguiendo() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let c = leida(&[(FAVS, json(&favorita(2, "Nueva")))]);
    let r = aplicar(&conn, &c, Modo::Reemplazar).unwrap();
    assert_eq!((r.historial, r.siguiendo), (None, None));
    assert_eq!(categoria_de(&conn, 1), None, "favoritos se vació");
    assert_eq!(categoria_de(&conn, 2), Some(Some("Nueva".into())));
    assert_eq!(estado_de(&conn, 1), Some(1), "sin following no se toca siguiendo");
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "sin history no se toca el historial");
    assert_eq!(contar(&conn, "anime"), 2);
    assert_eq!(copias(&ruta).len(), 1);
}

#[test]
fn reemplazar_los_tres_vacia_las_tres_tablas_pero_no_anime() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    let c = leida(&[
        (HISTORY, json(&visto(2, "1.0", 300))),
        (FOLLOWING, json(&seguida(2, 2))),
        (FAVS, json(&favorita(2, "Nueva"))),
    ]);
    aplicar_interno(&conn, &c, Modo::Reemplazar, false).unwrap();
    assert_eq!((visto_en(&conn, 1, 1.0), visto_en(&conn, 2, 1.0)), (None, Some(300)));
    assert_eq!((estado_de(&conn, 1), estado_de(&conn, 2)), (None, Some(2)));
    assert_eq!(categoria_de(&conn, 1), None);
    assert_eq!(contar(&conn, "anime"), 2, "nunca DELETE FROM anime");
}

#[test]
fn un_fallo_en_los_favs_deshace_los_otros_dos_archivos() {
    let conn = abrir_en_memoria().unwrap();
    sembrar(&conn);
    conn.execute_batch("DROP TABLE favoritos").unwrap();
    let c = leida(&[
        (HISTORY, json(&visto(2, "1.0", 1))),
        (FOLLOWING, json(&seguida(2, 2))),
        (FAVS, json(&favorita(2, "X"))),
    ]);
    assert!(aplicar_interno(&conn, &c, Modo::Reemplazar, false).is_err());
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000), "el historial se deshizo");
    assert_eq!(estado_de(&conn, 1), Some(1), "siguiendo se deshizo");
    assert_eq!(estado_de(&conn, 2), None);
}

#[test]
fn si_vacuum_into_falla_no_toca_la_base_ni_deja_temporales() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let inexistente = std::env::temp_dir().join(format!("mado-no-existe-{}", unico())).join("x.tmp");
    let destino = std::env::temp_dir().join(format!("mado-no-existe-{}", unico())).join("x.bak");
    assert!(escribir_copia(&conn, &inexistente, &destino).is_err());
    assert!(!inexistente.exists() && !destino.exists());
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
    assert_eq!(contar(&conn, "historial"), 1);
    assert!(copias(&ruta).is_empty() && restos(&ruta).is_empty());
}

#[test]
fn si_el_rename_falla_se_borra_el_temporal_y_no_hay_copia() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let mut temporal = std::ffi::OsString::from(&*ruta);
    temporal.push(".reemplazo-1.tmp");
    let temporal = PathBuf::from(temporal);
    let destino = std::env::temp_dir().join(format!("mado-no-existe-{}", unico())).join("x.bak");
    let err = escribir_copia(&conn, &temporal, &destino).unwrap_err();
    assert!(err.to_string().contains("disco"), "{err}");
    assert!(!temporal.exists(), "el temporal se limpia");
    assert!(!destino.exists());
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
}

#[test]
fn reemplazar_con_la_copia_imposible_devuelve_error_y_deja_la_base_intacta() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    // Un directorio con el nombre del temporal del mismo milisegundo impide la copia.
    let ms = 1_700_000_000_000u128;
    let mut tmp = std::ffi::OsString::from(&*ruta);
    tmp.push(format!(".reemplazo-{ms}.tmp"));
    std::fs::create_dir(&tmp).unwrap();
    assert!(copia_previa_en(&conn, ms).is_err());
    assert_eq!(visto_en(&conn, 1, 1.0), Some(5000));
    assert!(copias(&ruta).is_empty());
}

#[test]
fn el_temporal_no_usa_un_nombre_fijo() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    // Un directorio con el nombre fijo de antes ya no estorba.
    let mut fijo = std::ffi::OsString::from(&*ruta);
    fijo.push(".reemplazo.tmp");
    std::fs::create_dir(&fijo).unwrap();
    let c1 = copia_previa_en(&conn, 1_700_000_000_001).unwrap().unwrap();
    let c2 = copia_previa_en(&conn, 1_700_000_000_001).unwrap().unwrap();
    assert_ne!(c1, c2, "mismo milisegundo, copias distintas");
    assert_eq!(copias(&ruta).len(), 2);
    assert_eq!(restos(&ruta), vec![PathBuf::from(fijo)], "solo queda lo que puso la prueba");
}

#[test]
fn al_reemplazar_se_conservan_las_tres_copias_mas_recientes() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    for ms in [100u128, 200, 300, 400, 500] {
        let mut f = std::ffi::OsString::from(&*ruta);
        f.push(format!(".reemplazo-{ms}.bak"));
        std::fs::write(f, b"vieja").unwrap();
    }
    let nueva = PathBuf::from(
        aplicar(&conn, &leida(&[(HISTORY, json(&visto(2, "1.0", 1)))]), Modo::Reemplazar).unwrap().copia.unwrap(),
    );
    let quedan = copias(&ruta);
    assert_eq!(quedan.len(), 3);
    assert!(quedan.contains(&nueva), "la nueva se conserva");
    let nombres: Vec<String> = quedan.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert!(nombres.iter().any(|n| n.ends_with("-500.bak")) && nombres.iter().any(|n| n.ends_with("-400.bak")));
    assert!(!nombres.iter().any(|n| n.ends_with("-300.bak") || n.ends_with("-100.bak")));
}

#[test]
fn la_poda_ignora_archivos_que_no_son_copias() {
    let (ruta, conn) = base_en_disco();
    sembrar(&conn);
    let mut ajeno = std::ffi::OsString::from(&*ruta);
    ajeno.push(".reemplazo-notas.bak");
    std::fs::write(&ajeno, b"otro").unwrap();
    for ms in [1u128, 2, 3, 4] {
        copia_previa_en(&conn, ms).unwrap();
    }
    assert!(Path::new(&ajeno).exists());
    assert_eq!(copias(&ruta).len(), 4, "tres copias más el archivo que no encaja en el patrón");
}
