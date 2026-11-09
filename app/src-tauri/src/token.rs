//! Token de AniList y clave de TMDB en el Administrador de credenciales de Windows. Nunca va a SQLite ni a archivos,
//! y ningún mensaje de error lo incluye.

use keyring::Entry;

const SERVICIO: &str = "dev.kristovzem.ukikupc";
const USUARIO: &str = "anilist-token";
const USUARIO_TMDB: &str = "tmdb-clave";
/// El Administrador de credenciales admite hasta 2560 bytes por entrada; un JWT de AniList ronda 1000-1400.
const MAX_TOKEN: usize = 2000;

/// Un JWT son letras, dígitos y `-_.`. Se quitan todos los espacios y saltos de línea (la página de AniList
/// parte el token al copiarlo y un token nunca los lleva). Cualquier otra cosa se rechaza sin repetirla
/// en el mensaje.
fn validar(token: &str) -> Result<String, String> {
    let t: String = token.chars().filter(|c| !c.is_whitespace()).collect();
    if t.is_empty() {
        return Err("el token está vacío".into());
    }
    if t.chars().count() > MAX_TOKEN {
        return Err(format!("el token es demasiado largo ({} caracteres; el máximo es {MAX_TOKEN})", t.chars().count()));
    }
    // Se informa la posición y el código del primer carácter no permitido, nunca el contenido: por
    // definición no puede ser parte de un token válido.
    if let Some((i, c)) = t.chars().enumerate().find(|(_, c)| !(c.is_ascii_alphanumeric() || "-_.".contains(*c))) {
        return Err(format!(
            "el token tiene un carácter no permitido (U+{:04X}) en la posición {} de {}",
            c as u32,
            i + 1,
            t.chars().count()
        ));
    }
    Ok(t)
}

fn entrada() -> Result<Entry, String> {
    Entry::new(SERVICIO, USUARIO).map_err(|_| "no se pudo abrir el almacén de credenciales".to_string())
}

fn guardar_en(e: &Entry, token: &str) -> Result<(), String> {
    let t = validar(token)?;
    e.set_password(&t).map_err(|_| "no se pudo guardar el token en el almacén de credenciales".to_string())
}

fn leer_de(e: &Entry) -> Result<Option<String>, String> {
    match e.get_password() {
        Ok(t) => Ok(Some(t)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("no se pudo leer el token del almacén de credenciales".to_string()),
    }
}

fn borrar_de(e: &Entry) -> Result<(), String> {
    match e.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("no se pudo borrar el token del almacén de credenciales".to_string()),
    }
}

fn entrada_tmdb() -> Result<Entry, String> {
    Entry::new(SERVICIO, USUARIO_TMDB).map_err(|_| "no se pudo abrir el almacén de credenciales".to_string())
}

/// La clave de TMDB (v3, 32 caracteres, o token v4 de lectura) se guarda como el de AniList: solo ahí.
#[tauri::command(async)]
pub fn guardar_clave_tmdb(clave: String) -> Result<(), String> {
    guardar_en(&entrada_tmdb()?, &clave)
}

#[tauri::command(async)]
pub fn leer_clave_tmdb() -> Result<Option<String>, String> {
    leer_de(&entrada_tmdb()?)
}

#[tauri::command(async)]
pub fn borrar_clave_tmdb() -> Result<(), String> {
    borrar_de(&entrada_tmdb()?)
}

#[tauri::command(async)]
pub fn guardar_token_anilist(token: String) -> Result<(), String> {
    guardar_en(&entrada()?, &token)
}

#[tauri::command(async)]
pub fn leer_token_anilist() -> Result<Option<String>, String> {
    leer_de(&entrada()?)
}

#[tauri::command(async)]
pub fn borrar_token_anilist() -> Result<(), String> {
    borrar_de(&entrada()?)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn acepta_un_jwt_y_recorta_espacios() {
        let t = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxMjM0In0.firma-_x";
        assert_eq!(validar(&format!("  {t}\n")).unwrap(), t);
    }

    #[test]
    fn un_token_partido_en_lineas_o_con_espacios_se_junta() {
        assert_eq!(validar("eyJ0eXAi.eyJhdWQi\r\n  .firma-_x \n").unwrap(), "eyJ0eXAi.eyJhdWQi.firma-_x");
        assert_eq!(validar("abc def\tghi").unwrap(), "abcdefghi");
    }

    #[test]
    fn rechaza_vacio_enorme_o_con_caracteres_raros_sin_repetir_el_valor() {
        for malo in ["", "   ", &"a".repeat(MAX_TOKEN + 1), "ñandú", "\"abc.def\"", "Bearer:abc"] {
            let e = validar(malo).unwrap_err();
            assert!(!e.contains(malo.trim()) || malo.trim().is_empty(), "el error no debe incluir el token");
        }
    }

    /// Toca el Administrador de credenciales real (con otro nombre de servicio): se corre a mano con
    /// `cargo test --manifest-path app/src-tauri/Cargo.toml -- --ignored token`.
    #[test]
    #[ignore]
    fn guardar_leer_y_borrar_en_el_almacen_real() {
        let e = keyring::Entry::new("dev.kristovzem.ukikupc.prueba", "anilist-token").unwrap();
        assert_eq!(leer_de(&e).unwrap(), None);
        guardar_en(&e, "abc.def-ghi_jkl").unwrap();
        assert_eq!(leer_de(&e).unwrap().as_deref(), Some("abc.def-ghi_jkl"));
        borrar_de(&e).unwrap();
        borrar_de(&e).unwrap(); // borrar de nuevo no es un error
        assert_eq!(leer_de(&e).unwrap(), None);
    }
}
