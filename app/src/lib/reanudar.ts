import type { Ficha, Idioma } from '../../../core/src/index.ts';
import { idiomaGuardado } from './continuar.ts';
import { episodioPrincipal, type Principal, type ProgresoEp } from './episodiosFicha.ts';
import { fichaDeCache } from './fichaCache.ts';

/** Lo que hace falta para empezar un episodio fuera de la Ficha. La versión real está en `reanudarApp.ts`. */
export interface DepsReanudar {
  /** El JSON guardado de la lista de episodios (caché del #25), o `null`. */
  leerCache(slug: string): Promise<string | null>;
  /** La lista fresca, de la fuente. */
  pedir(slug: string): Promise<Ficha>;
  /** Idioma recordado de la serie (`idioma:<aid>`). */
  leerIdioma(aid: number): Promise<string | null>;
  idiomaDefecto(): Promise<Idioma>;
  vistos(aid: number): Promise<number[]>;
  /** Del más reciente al más antiguo, como `progreso_de_serie`. */
  progresos(aid: number): Promise<ProgresoEp[]>;
}

interface SerieMin {
  aid: number;
  slug: string;
}

const numerosDe = (f: Ficha) => f.episodes.map((e) => e.number).sort((a, b) => a - b);

/** La lista guardada si sirve (no está vacía y, si se pide uno, lo contiene); si no, la de la fuente. */
async function lista(deps: DepsReanudar, slug: string, numero?: number): Promise<number[]> {
  try {
    const guardada = fichaDeCache(await deps.leerCache(slug));
    if (guardada) {
      const numeros = numerosDe(guardada);
      if (numeros.length > 0 && (numero === undefined || numeros.includes(numero))) return numeros;
    }
  } catch (e) {
    console.error('reanudar: no se pudo leer la caché de episodios', e instanceof Error ? e.name : e);
  }
  return numerosDe(await deps.pedir(slug));
}

/** Qué episodio ofrecer: el mismo criterio que el botón grande de la Ficha. `null` si la serie no tiene episodios. */
export async function principalDeSerie(deps: DepsReanudar, serie: SerieMin): Promise<Principal | null> {
  const [numeros, vistos, progresos] = await Promise.all([lista(deps, serie.slug), deps.vistos(serie.aid), deps.progresos(serie.aid)]);
  return episodioPrincipal(numeros, new Set(vistos), progresos);
}

/** Lista e idioma para abrir el reproductor en `numero`. Lanza si el episodio ya no existe o la fuente falla. */
export async function prepararReproduccion(
  deps: DepsReanudar,
  serie: SerieMin,
  numero: number,
): Promise<{ numeros: number[]; numero: number; idioma: Idioma }> {
  const [numeros, idioma, defecto] = await Promise.all([
    lista(deps, serie.slug, numero),
    deps.leerIdioma(serie.aid).catch(() => null),
    deps.idiomaDefecto(),
  ]);
  if (!numeros.includes(numero)) throw new Error(`El episodio ${numero} ya no está en la lista.`);
  return { numeros, numero, idioma: idiomaGuardado(idioma, defecto) };
}
