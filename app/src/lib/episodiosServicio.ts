import type { Ficha } from '../../../core/src/index.ts';
import { fichaDeCache } from './fichaCache.ts';

export interface DepsEpisodios {
  /** El JSON guardado de la serie, o `null` si nunca se pidió. */
  leerCache(slug: string): Promise<string | null>;
  guardarCache(slug: string, datos: string): Promise<void>;
  /** La lista fresca, de la fuente. */
  pedir(slug: string): Promise<Ficha>;
}

export type OrigenFicha = 'cache' | 'fuente';

export interface ResultadoEpisodios {
  /** La más reciente que hubo: la fresca, o la guardada si la fuente falló; `null` si no hubo ninguna. */
  ficha: Ficha | null;
  /** El fallo de la fuente, si lo hubo (aunque se enseñara la caché). */
  error: unknown;
}

/**
 * «Caché primero»: si hay una lista guardada de la serie la enseña al instante (`alMostrar` con origen `cache`), pide la
 * fresca en segundo plano y, al llegar, la enseña (`fuente`) y la guarda. Si la fuente falla se queda con la guardada y
 * devuelve el error para que la pantalla lo avise. Nunca lanza: una caché rota o un guardado que falla se ignoran.
 */
export async function cargarEpisodiosConCache(
  deps: DepsEpisodios,
  slug: string,
  alMostrar: (ficha: Ficha, origen: OrigenFicha) => void,
): Promise<ResultadoEpisodios> {
  let guardada: Ficha | null = null;
  try {
    guardada = fichaDeCache(await deps.leerCache(slug));
  } catch (e) {
    console.error('episodios: no se pudo leer la caché', e instanceof Error ? e.name : e);
  }
  if (guardada) alMostrar(guardada, 'cache');
  try {
    const fresca = await deps.pedir(slug);
    alMostrar(fresca, 'fuente');
    try {
      await deps.guardarCache(slug, JSON.stringify(fresca));
    } catch (e) {
      console.error('episodios: no se pudo guardar en la caché', e instanceof Error ? e.name : e);
    }
    return { ficha: fresca, error: null };
  } catch (e) {
    return { ficha: guardada, error: e };
  }
}
