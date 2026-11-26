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

/**
 * La lista guardada si sirve; si no, la de la fuente. `deCache` dice de dónde salió.
 * Si se pide un episodio, la guardada sirve solo si lo contiene y no es el último: para encontrar el
 * siguiente el reproductor necesita la lista real, que una caché vieja no tendría.
 */
async function lista(deps: DepsReanudar, slug: string, numero?: number): Promise<{ numeros: number[]; deCache: boolean }> {
  try {
    const guardada = fichaDeCache(await deps.leerCache(slug));
    if (guardada) {
      const numeros = numerosDe(guardada);
      const sirve = numero === undefined || (numeros.includes(numero) && numero !== numeros[numeros.length - 1]);
      if (numeros.length > 0 && sirve) return { numeros, deCache: true };
    }
  } catch (e) {
    console.error('reanudar: no se pudo leer la caché de episodios', e instanceof Error ? e.name : e);
  }
  return { numeros: numerosDe(await deps.pedir(slug)), deCache: false };
}

/** Qué episodio ofrecer: el mismo criterio que el botón grande de la Ficha. `null` si la serie no tiene episodios. */
export async function principalDeSerie(deps: DepsReanudar, serie: SerieMin): Promise<Principal | null> {
  const [{ numeros, deCache }, vistos, progresos] = await Promise.all([
    lista(deps, serie.slug),
    deps.vistos(serie.aid),
    deps.progresos(serie.aid),
  ]);
  const conjunto = new Set(vistos);
  const principal = episodioPrincipal(numeros, conjunto, progresos);
  if (!deCache || principal?.tipo !== 'repetir') return principal;
  // Todo visto según la lista guardada: puede haber salido un episodio nuevo, se confirma con la fuente.
  try {
    return episodioPrincipal(numerosDe(await deps.pedir(serie.slug)), conjunto, progresos);
  } catch (e) {
    console.error('reanudar: no se pudo confirmar con la fuente', e instanceof Error ? e.name : e);
    return principal;
  }
}

/** Lista e idioma para abrir el reproductor en `numero`. Lanza si el episodio ya no existe o la fuente falla. */
export async function prepararReproduccion(
  deps: DepsReanudar,
  serie: SerieMin,
  numero: number,
): Promise<{ numeros: number[]; numero: number; idioma: Idioma }> {
  const [{ numeros }, idioma, defecto] = await Promise.all([
    lista(deps, serie.slug, numero),
    deps.leerIdioma(serie.aid).catch(() => null),
    deps.idiomaDefecto(),
  ]);
  if (!numeros.includes(numero)) throw new Error(`El episodio ${numero} ya no está en la lista.`);
  return { numeros, numero, idioma: idiomaGuardado(idioma, defecto) };
}
