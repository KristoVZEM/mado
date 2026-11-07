import { resolverPrimero } from './cadena.ts';
import { buscar } from './busqueda.ts';
import { episodio } from './episodio.ts';
import { episodios } from './episodios.ts';
import { createHttp } from './http.ts';
import type { Http, HttpOptions } from './http.ts';
import { resolverZilla } from './zilla.ts';
import type { Idioma, Playable, ResolverServidor } from './types.ts';

export * from './errors.ts';
export type { Embed, Idioma, Playable, ResolverServidor } from './types.ts';
export type { Http, HttpOptions } from './http.ts';
export type { ResultadoBusqueda } from './busqueda.ts';
export type { Episodio, Ficha } from './episodios.ts';

export interface OpcionesFuentes {
  /** Cliente ya construido (tests). Si falta, se crea uno con `httpOptions`. */
  http?: Http;
  httpOptions?: HttpOptions;
  /** Cadena de servidores en orden de prioridad. Por defecto, solo Zilla. */
  resolvers?: ResolverServidor[];
}

export function crearFuentes(opts: OpcionesFuentes = {}) {
  const http = opts.http ?? createHttp(opts.httpOptions);
  const resolvers = opts.resolvers ?? [resolverZilla];
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
