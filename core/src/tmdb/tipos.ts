/** Lo que TMDB sabe de una serie y nos sirve: rutas de un fondo y un logo (se completan con `urlImagenTmdb`). */
export interface ImagenesTmdb {
  tmdbId: number;
  tipo: 'tv' | 'movie';
  /** Ruta del fondo 16:9 (`/abc.jpg`), o `null` si TMDB no tiene ninguno. */
  fondo: string | null;
  /** Ruta del logo con transparencia, o `null`. */
  logo: string | null;
}

/** Los nombres de una obra de AniList, lo único que hace falta para reconocerla en TMDB. */
export interface ObraParaTmdb {
  tituloRomaji: string;
  tituloIngles: string | null;
  tituloNativo: string | null;
  sinonimos: string[];
  /** `MOVIE` se busca entre las películas; el resto, entre las series. */
  formato: string | null;
}
