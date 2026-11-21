import { decodePage } from './devalue.ts';
import { FuenteCambio } from './errors.ts';
import { BASE, leerJson } from './http.ts';
import type { Http } from './http.ts';
import type { Embed } from './types.ts';

export interface DetalleEpisodio {
  number: number;
  variants: Record<string, number>;
  embeds: Record<string, Embed[]>;
  /** Id de MyAnimeList de la serie; `null` si la fuente no lo trae. Es decoración: nunca provoca FuenteCambio. */
  malId: number | null;
}

/** Entero >= 1, que es lo que acepta AniSkip; cualquier otra cosa es `null`. */
function malIdDe(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null;
}

export function parseEpisodio(payload: Parameters<typeof decodePage>[0]): DetalleEpisodio {
  const page = decodePage(payload);
  if (!page.episode) throw new FuenteCambio('episodio: la respuesta no trae "episode"');
  if (!page.embeds || typeof page.embeds !== 'object') {
    throw new FuenteCambio('episodio: la respuesta no trae "embeds"');
  }
  for (const [idioma, lista] of Object.entries<any>(page.embeds)) {
    if (!Array.isArray(lista) || lista.some((e) => typeof e?.server !== 'string' || typeof e?.url !== 'string')) {
      throw new FuenteCambio(`episodio: los embeds de ${idioma} no tienen la forma {server, url}`);
    }
  }
  return {
    number: page.episode.number,
    variants: page.episode.variants ?? {},
    embeds: page.embeds,
    malId: malIdDe(page.media?.malId),
  };
}

export async function episodio(http: Http, slug: string, n: number): Promise<DetalleEpisodio> {
  const res = await http.get(`${BASE}/media/${encodeURIComponent(slug)}/${n}/__data.json`);
  return parseEpisodio(await leerJson(res, `episodio ${n} de ${slug}`));
}
