import { resolverPrimero } from './cadena.ts';
import { buscar } from './busqueda.ts';
import { episodio } from './episodio.ts';
import { episodios } from './episodios.ts';
import { createHttp } from './http.ts';
import type { Http, HttpOptions } from './http.ts';
import { crearResolverMP4Upload } from './resolver-mp4upload.ts';
import type { CapturarStream } from './resolver-mp4upload.ts';
import { crearResolverVoe } from './resolver-voe.ts';
import { crearResolverZilla } from './zilla.ts';
import type { Idioma, Playable, ResolverServidor } from './types.ts';

export * from './errors.ts';
export * from './anilist/index.ts';
export * from './avisos.ts';
export type { Embed, Idioma, Playable, ResolverServidor } from './types.ts';
export type { Http, HttpOptions } from './http.ts';
export type { ResultadoBusqueda } from './busqueda.ts';
export type { Episodio, Ficha } from './episodios.ts';
export { crearResolverMP4Upload } from './resolver-mp4upload.ts';
export type { CapturarStream } from './resolver-mp4upload.ts';
export { crearResolverVoe } from './resolver-voe.ts';

export interface OpcionesFuentes {
  /** Cliente ya construido (tests). Si falta, se crea uno con `httpOptions`. */
  http?: Http;
  httpOptions?: HttpOptions;
  /**
   * Carga un embed en un WebView oculto y devuelve la URL del stream (en la app, el comando
   * `resolve_webview`). Sin ella, MP4Upload no entra en la cadena por defecto.
   */
  capturarStream?: CapturarStream;
  /** Cadena de servidores en orden de prioridad. Por defecto: Zilla, MP4Upload (si hay captura) y Voe. */
  resolvers?: ResolverServidor[];
}

export function crearFuentes(opts: OpcionesFuentes = {}) {
  const http = opts.http ?? createHttp(opts.httpOptions);
  const resolvers = opts.resolvers ?? [
    crearResolverZilla(http),
    ...(opts.capturarStream ? [crearResolverMP4Upload(opts.capturarStream)] : []),
    crearResolverVoe(http),
  ];
  return {
    buscar: (query: string) => buscar(http, query),
    episodios: (slug: string) => episodios(http, slug),
    async resolver(slug: string, n: number, idioma: Idioma = 'SUB'): Promise<Playable> {
      const detalle = await episodio(http, slug, n);
      const { playable } = await resolverPrimero(detalle.embeds[idioma] ?? [], resolvers, http.userAgent);
      return playable;
    },
  };
}
