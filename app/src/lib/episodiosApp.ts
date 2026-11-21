import type { Ficha } from '../../../core/src/index.ts';
import { episodiosGuardar, episodiosLeer } from './datos.ts';
import { cargarEpisodiosConCache, type OrigenFicha, type ResultadoEpisodios } from './episodiosServicio.ts';
import { fuentes } from './fuentes.ts';

/** La lista de episodios de una serie con la caché local primero (ver `cargarEpisodiosConCache`). */
export const cargarEpisodios = (
  slug: string,
  alMostrar: (ficha: Ficha, origen: OrigenFicha) => void,
): Promise<ResultadoEpisodios> =>
  cargarEpisodiosConCache(
    {
      leerCache: async (s) => (await episodiosLeer(s))?.datos ?? null,
      guardarCache: episodiosGuardar,
      pedir: (s) => fuentes.episodios(s),
    },
    slug,
    alMostrar,
  );
