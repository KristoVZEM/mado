import { invoke } from '@tauri-apps/api/core';
import { fetch as fetchDeTauri } from '@tauri-apps/plugin-http';
import { createHttp, crearFuentes } from '../../../core/src/index.ts';
import { ajustes } from './ajustes.svelte.ts';
import { esperaMs } from './datosAjustes.ts';

/**
 * Las peticiones a la fuente salen por Rust (plugin-http), sin CORS, y comparten UNA cola con pausa mínima entre ellas
 * (cortesía con la fuente). MP4Upload se resuelve cargando el embed en un WebView oculto (comando `resolve_webview`).
 */
const http = createHttp({
  fetch: fetchDeTauri as typeof fetch,
  // La espera se lee en cada petición: cambiarla en Ajustes vale desde la siguiente.
  timeoutMs: () => esperaMs(ajustes.espera),
});

/** Lo que el usuario acaba de pedir (abrir una serie, reproducir, buscar): prioridad alta en la cola. */
export const fuentes = crearFuentes({
  http,
  capturarStream: (embedUrl) =>
    invoke<string>('resolve_webview', {
      server: 'mp4upload',
      url: embedUrl,
      timeoutMs: 20_000,
      visible: false,
    }),
});

/**
 * Tareas de fondo (las populares de Inicio, los avisos de episodios nuevos): misma cola y misma pausa, pero prioridad baja,
 * para que nunca hagan esperar a lo que el usuario acaba de abrir. Solo para buscar y listar episodios.
 */
export const fuentesFondo = crearFuentes({ http: http.conPrioridad('baja') });
