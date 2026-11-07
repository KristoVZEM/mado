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
}

export function parseEpisodios(payload: Parameters<typeof decodePage>[0]): Ficha {
  const page = decodePage(payload);
  const media = page.media;
  if (!media || typeof media !== 'object') throw new FuenteCambio('ficha: la respuesta no trae "media"');
  if (!Array.isArray(media.episodes)) throw new FuenteCambio('ficha: "media" no trae "episodes"');
  const episodes = media.episodes.map((e: any, i: number): Episodio => {
    if (typeof e?.id !== 'number' || typeof e?.number !== 'number') {
      throw new FuenteCambio(`ficha: el episodio ${i} no trae "id" y "number" numéricos`);
    }
    return { id: e.id, number: e.number };
  });
  return { title: String(media.title ?? ''), episodes };
}

export async function episodios(http: Http, slug: string): Promise<Ficha> {
  const res = await http.get(`${BASE}/media/${encodeURIComponent(slug)}/__data.json`);
  return parseEpisodios(await leerJson(res, `ficha de ${slug}`));
}
