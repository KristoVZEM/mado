export interface Embed {
  server: string;
  url: string;
}

export type Idioma = 'SUB' | 'DUB';

/** Lo único que pasa de las fuentes al reproductor. `calidad` es la altura en píxeles si se conoce. */
export interface Playable {
  url: string;
  headers: Record<string, string>;
  userAgent: string;
  calidad?: number;
  /** El `server` del embed que ganó (por ejemplo "HLS", "MP4Upload"); lo rellena la cadena. */
  servidor?: string;
  /** Id de MyAnimeList de la serie, si la fuente lo trae; lo rellena `resolver`. */
  malId?: number;
}

export type ResolverServidor = (
  embed: Embed,
  userAgent: string,
) => Playable | null | Promise<Playable | null>;
