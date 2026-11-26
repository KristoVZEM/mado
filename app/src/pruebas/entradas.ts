import type { EntradaVista } from '../lib/bibliotecaVista.ts';

/** Una serie de la Biblioteca para pruebas: Viendo, sin actividad ni AniList, salvo lo que se pase. */
export const ev = (aid: number, titulo: string, extra: Partial<EntradaVista> = {}): EntradaVista => ({
  aid,
  slug: `s-${aid}`,
  titulo,
  estado: 1,
  ultimoEpisodio: null,
  vistoEn: null,
  vistos: 0,
  total: null,
  puntuacion: null,
  generos: [],
  favorito: false,
  ...extra,
});
