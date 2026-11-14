//! Migración única desde el nombre anterior de la app (`ukiku-pc`, identificador `dev.kristovzem.ukikupc`).
//!
//! El identificador decide la carpeta de datos locales y el nombre de servicio de las credenciales, así que
//! cambiarlo sin más dejaría al usuario sin historial, ajustes ni tokens. Aquí se mueve la carpeta entera (que
//! incluye el almacén de la ventana web) y se pasan las credenciales al nombre nuevo. Quien instala por primera
//! vez no tiene nada viejo y no se toca nada.

use std::io;
use std::path::Path;

pub const IDENTIFICADOR_ANTIGUO: &str = "dev.kristovzem.ukikupc";
pub const IDENTIFICADOR: &str = "dev.kristovzem.mado";

const BASE_ANTIGUA: &str = "ukiku.db";
const BASE_NUEVA: &str = "mado.db";
/// Usuarios (nombres de entrada) que la app guarda en el almacén de credenciales.
const USUARIOS: [&str; 2] = ["anilist-token", "tmdb-clave"];

/// Mueve `<local>/<identificador antiguo>` a `<local>/<identificador nuevo>` y renombra la base y sus copias
/// (`ukiku.db`, `ukiku.db-wal`, `ukiku.db.v1.bak`...). No hace nada si no hay carpeta antigua o si la nueva ya
/// existe (no se pisa nada). Devuelve si migró.
pub fn migrar_carpeta(local: &Path) -> io::Result<bool> {
    let vieja = local.join(IDENTIFICADOR_ANTIGUO);
    let nueva = local.join(IDENTIFICADOR);
    if !vieja.is_dir() || nueva.exists() {
        return Ok(false);
    }
    std::fs::rename(&vieja, &nueva)?;
    for entrada in std::fs::read_dir(&nueva)?.filter_map(|e| e.ok()) {
        let nombre = entrada.file_name().to_string_lossy().into_owned();
        let Some(resto) = nombre.strip_prefix(BASE_ANTIGUA) else { continue };
        let destino = nueva.join(format!("{BASE_NUEVA}{resto}"));
        if !destino.exists() {
            std::fs::rename(entrada.path(), destino)?;
        }
    }
    Ok(true)
}

/// El almacén de credenciales visto desde la migración, para poder probarla sin tocar el de Windows.
pub trait Almacen {
    fn leer(&self, servicio: &str, usuario: &str) -> Result<Option<String>, String>;
    fn guardar(&self, servicio: &str, usuario: &str, valor: &str) -> Result<(), String>;
    fn borrar(&self, servicio: &str, usuario: &str) -> Result<(), String>;
}

/// Pasa el token de AniList y la clave de TMDB del servicio antiguo al nuevo. La entrada vieja solo se borra
/// cuando la nueva ya tiene valor; si la nueva existía, gana y la vieja se limpia. Devuelve los avisos de lo
/// que falló (sin incluir nunca un valor).
pub fn migrar_credenciales(almacen: &impl Almacen) -> Vec<String> {
    let mut avisos = Vec::new();
    for usuario in USUARIOS {
        let vieja = match almacen.leer(IDENTIFICADOR_ANTIGUO, usuario) {
            Ok(Some(v)) => v,
            Ok(None) => continue,
            Err(e) => {
                avisos.push(format!("{usuario}: {e}"));
                continue;
            }
        };
        let nueva_tiene = matches!(almacen.leer(IDENTIFICADOR, usuario), Ok(Some(_)));
        if !nueva_tiene && let Err(e) = almacen.guardar(IDENTIFICADOR, usuario, &vieja) {
            avisos.push(format!("{usuario}: {e}"));
            continue;
        }
        if let Err(e) = almacen.borrar(IDENTIFICADOR_ANTIGUO, usuario) {
            avisos.push(format!("{usuario}: {e}"));
        }
    }
    avisos
}

/// El Administrador de credenciales de Windows.
pub struct AlmacenReal;

impl AlmacenReal {
    fn entrada(servicio: &str, usuario: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(servicio, usuario).map_err(|_| "no se pudo abrir el almacén de credenciales".to_string())
    }
}

impl Almacen for AlmacenReal {
    fn leer(&self, servicio: &str, usuario: &str) -> Result<Option<String>, String> {
        match Self::entrada(servicio, usuario)?.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("no se pudo leer del almacén de credenciales".to_string()),
        }
    }
    fn guardar(&self, servicio: &str, usuario: &str, valor: &str) -> Result<(), String> {
        Self::entrada(servicio, usuario)?
            .set_password(valor)
            .map_err(|_| "no se pudo guardar en el almacén de credenciales".to_string())
    }
    fn borrar(&self, servicio: &str, usuario: &str) -> Result<(), String> {
        match Self::entrada(servicio, usuario)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("no se pudo borrar del almacén de credenciales".to_string()),
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn carpeta_temporal() -> PathBuf {
        static N: AtomicU64 = AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!("mado-migracion-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    fn escribir(ruta: &Path, texto: &str) {
        std::fs::create_dir_all(ruta.parent().unwrap()).unwrap();
        std::fs::write(ruta, texto).unwrap();
    }

    #[test]
    fn mueve_la_carpeta_y_renombra_la_base_con_sus_acompanantes() {
        let local = carpeta_temporal();
        let vieja = local.join(IDENTIFICADOR_ANTIGUO);
        escribir(&vieja.join("ukiku.db"), "datos");
        escribir(&vieja.join("ukiku.db-wal"), "wal");
        escribir(&vieja.join("ukiku.db.v1.bak"), "bak");
        escribir(&vieja.join("EBWebView/Default/Local Storage/x"), "tema");
        escribir(&vieja.join("copias/ukiku-2026-11-10.db"), "copia");

        assert!(migrar_carpeta(&local).unwrap());

        let nueva = local.join(IDENTIFICADOR);
        assert!(!vieja.exists());
        assert_eq!(std::fs::read_to_string(nueva.join("mado.db")).unwrap(), "datos");
        assert_eq!(std::fs::read_to_string(nueva.join("mado.db-wal")).unwrap(), "wal");
        assert_eq!(std::fs::read_to_string(nueva.join("mado.db.v1.bak")).unwrap(), "bak");
        assert!(!nueva.join("ukiku.db").exists());
        assert_eq!(std::fs::read_to_string(nueva.join("EBWebView/Default/Local Storage/x")).unwrap(), "tema");
        assert!(nueva.join("copias/ukiku-2026-11-10.db").exists(), "las copias automáticas no se renombran");
        let _ = std::fs::remove_dir_all(&local);
    }

    #[test]
    fn sin_carpeta_antigua_no_hace_nada() {
        let local = carpeta_temporal();
        assert!(!migrar_carpeta(&local).unwrap());
        assert!(!local.join(IDENTIFICADOR).exists());
        let _ = std::fs::remove_dir_all(&local);
    }

    #[test]
    fn si_la_nueva_ya_existe_no_pisa_nada() {
        let local = carpeta_temporal();
        escribir(&local.join(IDENTIFICADOR_ANTIGUO).join("ukiku.db"), "viejo");
        escribir(&local.join(IDENTIFICADOR).join("mado.db"), "nuevo");
        assert!(!migrar_carpeta(&local).unwrap());
        assert_eq!(std::fs::read_to_string(local.join(IDENTIFICADOR).join("mado.db")).unwrap(), "nuevo");
        assert!(local.join(IDENTIFICADOR_ANTIGUO).join("ukiku.db").exists());
        let _ = std::fs::remove_dir_all(&local);
    }

    #[test]
    fn migrar_dos_veces_es_inofensivo() {
        let local = carpeta_temporal();
        escribir(&local.join(IDENTIFICADOR_ANTIGUO).join("ukiku.db"), "datos");
        assert!(migrar_carpeta(&local).unwrap());
        assert!(!migrar_carpeta(&local).unwrap());
        assert_eq!(std::fs::read_to_string(local.join(IDENTIFICADOR).join("mado.db")).unwrap(), "datos");
        let _ = std::fs::remove_dir_all(&local);
    }

    #[derive(Default)]
    struct Falso {
        datos: RefCell<HashMap<(String, String), String>>,
        falla_guardar: bool,
    }

    impl Falso {
        fn con(servicio: &str, usuario: &str, valor: &str) -> Self {
            let f = Falso::default();
            f.datos.borrow_mut().insert((servicio.into(), usuario.into()), valor.into());
            f
        }
        fn valor(&self, servicio: &str, usuario: &str) -> Option<String> {
            self.datos.borrow().get(&(servicio.to_string(), usuario.to_string())).cloned()
        }
    }

    impl Almacen for Falso {
        fn leer(&self, s: &str, u: &str) -> Result<Option<String>, String> {
            Ok(self.valor(s, u))
        }
        fn guardar(&self, s: &str, u: &str, v: &str) -> Result<(), String> {
            if self.falla_guardar {
                return Err("sin permiso".into());
            }
            self.datos.borrow_mut().insert((s.into(), u.into()), v.into());
            Ok(())
        }
        fn borrar(&self, s: &str, u: &str) -> Result<(), String> {
            self.datos.borrow_mut().remove(&(s.to_string(), u.to_string()));
            Ok(())
        }
    }

    #[test]
    fn las_credenciales_pasan_al_servicio_nuevo_y_se_borran_las_viejas() {
        let a = Falso::con(IDENTIFICADOR_ANTIGUO, "anilist-token", "T1");
        a.datos.borrow_mut().insert((IDENTIFICADOR_ANTIGUO.into(), "tmdb-clave".into()), "K1".into());
        assert!(migrar_credenciales(&a).is_empty());
        assert_eq!(a.valor(IDENTIFICADOR, "anilist-token").as_deref(), Some("T1"));
        assert_eq!(a.valor(IDENTIFICADOR, "tmdb-clave").as_deref(), Some("K1"));
        assert_eq!(a.valor(IDENTIFICADOR_ANTIGUO, "anilist-token"), None);
        assert_eq!(a.valor(IDENTIFICADOR_ANTIGUO, "tmdb-clave"), None);
    }

    #[test]
    fn si_la_nueva_ya_tiene_valor_gana_y_la_vieja_se_limpia() {
        let a = Falso::con(IDENTIFICADOR_ANTIGUO, "anilist-token", "VIEJO");
        a.datos.borrow_mut().insert((IDENTIFICADOR.into(), "anilist-token".into()), "NUEVO".into());
        assert!(migrar_credenciales(&a).is_empty());
        assert_eq!(a.valor(IDENTIFICADOR, "anilist-token").as_deref(), Some("NUEVO"));
        assert_eq!(a.valor(IDENTIFICADOR_ANTIGUO, "anilist-token"), None);
    }

    #[test]
    fn si_no_se_puede_guardar_la_vieja_se_conserva_y_el_aviso_no_lleva_el_valor() {
        let mut a = Falso::con(IDENTIFICADOR_ANTIGUO, "anilist-token", "SECRETO");
        a.falla_guardar = true;
        let avisos = migrar_credenciales(&a);
        assert_eq!(avisos.len(), 1);
        assert!(!avisos[0].contains("SECRETO"));
        assert_eq!(a.valor(IDENTIFICADOR_ANTIGUO, "anilist-token").as_deref(), Some("SECRETO"));
    }

    #[test]
    fn sin_credenciales_viejas_no_hace_nada() {
        let a = Falso::default();
        assert!(migrar_credenciales(&a).is_empty());
        assert!(a.datos.borrow().is_empty());
    }
}
