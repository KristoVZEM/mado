import { decodePage } from './devalue.ts';
import { FuenteCambio } from './errors.ts';
import { BASE, leerJson } from './http.ts';
import type { Http } from './http.ts';

export interface Episodio {
  id: number;
  number: number;
}

export interface Ficha {
  title: string;
  episodes: Episodio[];
  /** Sinopsis; vacía si la fuente no la trae. Es decoración: nunca provoca FuenteCambio. */
  synopsis: string;
  genres: string[];
  /** Estado de emisión tal como lo escribe la fuente; vacío si no viene. */
  status: string;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Géneros como cadenas o como objetos con `name` o `title`; lo que no sea texto se descarta. */
function generos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((g: any) => texto(typeof g === 'string' ? g : (g?.name ?? g?.title)))
    .filter((g) => g !== '');
}

export function parseEpisodios(payload: Parameters<typeof decodePage>[0]): Ficha {
  const page = decodePage(payload);
  const media = page.media;
  if (!media || typeof media !== 'object') throw new FuenteCambio('ficha: la respuesta no trae "media"');
  if (!Array.isArray(media.episodes)) throw new FuenteCambio('ficha: "media" no trae "episodes"');
  const episodes = media.episodes.map((e: any, i: number): Episodio => {
    if (typeof e?.id !== 'number' || typeof e?.number !== 'number' ||
      !Number.isFinite(e.id) || !Number.isFinite(e.number)) {
      throw new FuenteCambio(`ficha: el episodio ${i} no trae "id" y "number" numéricos`);
    }
    return { id: e.id, number: e.number };
  });
  return {
    title: String(media.title ?? ''),
    episodes,
    synopsis: texto(media.synopsis),
    genres: generos(media.genres),
    status: texto(media.status),
  };
}

export async function episodios(http: Http, slug: string): Promise<Ficha> {
  const res = await http.get(`${BASE}/media/${encodeURIComponent(slug)}/__data.json`);
  return parseEpisodios(await leerJson(res, `ficha de ${slug}`));
}
