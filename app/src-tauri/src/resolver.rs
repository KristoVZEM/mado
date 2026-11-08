//! Reglas de confianza para la resolución por WebView.
//!
//! La URL de stream que devuelve el WebView la escribe una página de terceros (llega por
//! `document.title`), así que nunca se le da a mpv sin validarla: mpv acepta esquemas como
//! `file://` o `lavfi://`. Cada servidor lleva su lista de hosts permitidos y la lista vive
//! aquí, en Rust, no en el frontend.

use tauri::Url;

pub struct ServerRule {
    pub name: &'static str,
    /// Dominio de la página embed (y de lo que se puede navegar dentro de la ventana).
    pub page_domain: &'static str,
    /// Dominio del que sale el stream.
    pub stream_domain: &'static str,
    /// El último segmento de la ruta del stream.
    pub stream_file: &'static str,
}

pub const MP4UPLOAD: ServerRule = ServerRule {
    name: "mp4upload",
    page_domain: "mp4upload.com",
    stream_domain: "mp4upload.com",
    stream_file: "video.mp4",
};

pub fn rule(server: &str) -> Option<&'static ServerRule> {
    [&MP4UPLOAD].into_iter().find(|r| r.name == server)
}

/// `host` es el dominio o un subdominio directo suyo (no basta con `ends_with` a secas:
/// `evilmp4upload.com` no debe pasar).
fn host_in(host: &str, domain: &str) -> bool {
    host == domain || host.strip_suffix(domain).is_some_and(|rest| rest.ends_with('.'))
}

fn is_plain_https(url: &Url) -> bool {
    url.scheme() == "https" && url.username().is_empty() && url.password().is_none()
}

/// ¿Se puede cargar o navegar a esta URL dentro del WebView oculto?
pub fn page_allowed(rule: &ServerRule, url: &Url) -> bool {
    is_plain_https(url) && url.host_str().is_some_and(|h| host_in(h, rule.page_domain))
}

/// Valida la URL de stream capturada antes de dársela a mpv.
pub fn validate_stream(rule: &ServerRule, raw: &str) -> Result<Url, String> {
    let url: Url = raw.parse().map_err(|e| format!("URL de stream inválida: {e}"))?;
    if !is_plain_https(&url) {
        return Err(format!("esquema o credenciales no permitidos: {}", url.scheme()));
    }
    let host = url.host_str().ok_or("URL de stream sin host")?;
    if !host_in(host, rule.stream_domain) {
        return Err(format!("host de stream no permitido: {host}"));
    }
    if url.path_segments().and_then(|mut s| s.next_back()) != Some(rule.stream_file) {
        return Err("la ruta del stream no termina en el archivo esperado".into());
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OK: &str = "https://a4.mp4upload.com:183/d/abc123/video.mp4";

    #[test]
    fn acepta_el_stream_real() {
        assert!(validate_stream(&MP4UPLOAD, OK).is_ok());
    }

    #[test]
    fn rechaza_esquemas_peligrosos() {
        for u in [
            "http://a4.mp4upload.com/d/x/video.mp4",
            "file:///C:/Windows/win.ini",
            "lavfi://color=c=red",
            "ftp://a4.mp4upload.com/video.mp4",
            "javascript:alert(1)",
        ] {
            assert!(validate_stream(&MP4UPLOAD, u).is_err(), "{u}");
        }
    }

    #[test]
    fn rechaza_hosts_que_solo_se_parecen() {
        for u in [
            "https://evilmp4upload.com/d/x/video.mp4",
            "https://mp4upload.com.evil.com/d/x/video.mp4",
            "https://evil.com/mp4upload.com/video.mp4",
            "https://127.0.0.1/d/x/video.mp4",
        ] {
            assert!(validate_stream(&MP4UPLOAD, u).is_err(), "{u}");
        }
    }

    #[test]
    fn rechaza_credenciales_en_la_url() {
        assert!(validate_stream(&MP4UPLOAD, "https://user:pw@a4.mp4upload.com/d/x/video.mp4").is_err());
        assert!(validate_stream(&MP4UPLOAD, "https://mp4upload.com@evil.com/d/x/video.mp4").is_err());
    }

    #[test]
    fn rechaza_otra_ruta() {
        assert!(validate_stream(&MP4UPLOAD, "https://a4.mp4upload.com/d/x/otro.mp4").is_err());
        assert!(validate_stream(&MP4UPLOAD, "https://a4.mp4upload.com/d/x/video.mp4/mas").is_err());
    }

    #[test]
    fn navegacion_solo_dentro_del_dominio() {
        let ok: Url = "https://www.mp4upload.com/embed-abc.html".parse().unwrap();
        let ad: Url = "https://ads.example.com/click".parse().unwrap();
        let http: Url = "http://www.mp4upload.com/embed-abc.html".parse().unwrap();
        assert!(page_allowed(&MP4UPLOAD, &ok));
        assert!(!page_allowed(&MP4UPLOAD, &ad));
        assert!(!page_allowed(&MP4UPLOAD, &http));
    }

    #[test]
    fn servidor_desconocido() {
        assert!(rule("mp4upload").is_some());
        assert!(rule("voe").is_none());
    }
}
