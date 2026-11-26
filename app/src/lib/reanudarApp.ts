import { ajustes, asegurarAjustes } from './ajustes.svelte.ts';
import { episodiosLeer, episodiosVistos, leerAjuste, progresoDeSerie } from './datos.ts';
import { fuentes } from './fuentes.ts';
import type { DepsReanudar } from './reanudar.ts';

/** Dependencias reales de `reanudar.ts`: la base de Tauri y la fuente con prioridad alta (lo pidió el usuario). */
export const depsReanudar: DepsReanudar = {
  leerCache: async (slug) => (await episodiosLeer(slug))?.datos ?? null,
  pedir: (slug) => fuentes.episodios(slug),
  leerIdioma: (aid) => leerAjuste(`idioma:${aid}`),
  idiomaDefecto: async () => {
    await asegurarAjustes();
    return ajustes.idiomaDefecto;
  },
  vistos: episodiosVistos,
  progresos: progresoDeSerie,
};
