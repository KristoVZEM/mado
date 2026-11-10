import { invoke } from '@tauri-apps/api/core';
import { fetch as fetchDeTauri } from '@tauri-apps/plugin-http';
import { crearFuentes } from '../../../core/src/index.ts';
import { ajustes } from './ajustes.svelte.ts';
import { esperaMs } from './datosAjustes.ts';

/**
 * Las peticiones a la fuente salen por Rust (plugin-http), sin CORS. MP4Upload se resuelve
 * cargando el embed en un WebView oculto (comando `resolve_webview`).
 */
export const fuentes = crearFuentes({
  // La espera se lee en cada petición: cambiarla en Ajustes vale desde la siguiente.
  httpOptions: { fetch: fetchDeTauri as typeof fetch, timeoutMs: () => esperaMs(ajustes.espera) },
  capturarStream: (embedUrl) =>
    invoke<string>('resolve_webview', {
      server: 'mp4upload',
      url: embedUrl,
      timeoutMs: 20_000,
      visible: false,
    }),
});
