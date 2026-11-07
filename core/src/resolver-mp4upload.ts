import { FuenteCambio, SinRed } from './errors.ts';
import type { ResolverServidor } from './types.ts';

/**
 * Carga el embed en un WebView oculto y devuelve la primera URL de stream que la página pida.
 * En la app es el comando de Rust `resolve_webview`; aquí se inyecta para no depender de Tauri.
 */
export type CapturarStream = (embedUrl: string) => Promise<string>;

const EMBED_MP4UPLOAD = /^https:\/\/www\.mp4upload\.com\/embed-[A-Za-z0-9]+\.html(?=[?#]|$)/;
const REFERER = 'https://www.mp4upload.com/';

/** MP4Upload (1080p por WebView). La calidad real no está garantizada, por eso no se declara. */
export function crearResolverMP4Upload(capturar: CapturarStream): ResolverServidor {
  return async (embed, userAgent) => {
    if (!EMBED_MP4UPLOAD.test(embed.url)) return null;
    let url: unknown;
    try {
      url = await capturar(embed.url);
    } catch (e) {
      // Lo más común es un timeout (red bloqueada o página lenta); también puede ser que la página cambiara.
      throw new SinRed('mp4upload: no se capturó el stream (timeout o la página cambió)', { cause: e });
    }
    if (typeof url !== 'string' || !url.startsWith('https://')) {
      throw new FuenteCambio('mp4upload: la captura no es una URL https');
    }
    return { url, headers: { referer: REFERER }, userAgent };
  };
}
