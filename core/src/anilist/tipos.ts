export interface RelacionAnilist {
  anilistId: number;
  tipo: string;
  titulo: string;
}

/** Una obra de AniList normalizada. Mismos campos y nombres que guarda Rust (`datos/anilist.rs`). */
export interface MediaAnilist {
  anilistId: number;
  malId: number | null;
  tituloRomaji: string;
  tituloIngles: string | null;
  tituloNativo: string | null;
  sinopsis: string | null;
  generos: string[];
  formato: string | null;
  estudio: string | null;
  puntuacion: number | null;
  episodios: number | null;
  estado: string | null;
  portada: string | null;
  banner: string | null;
  /** Número y hora (segundos desde 1970) del próximo episodio; `null` si no se emite ahora. */
  siguienteEp: number | null;
  siguienteEn: number | null;
  relaciones: RelacionAnilist[];
  sinonimos: string[];
  anio: number | null;
  /** Duración típica de un episodio, en minutos. */
  duracion: number | null;
}
