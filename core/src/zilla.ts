import type { Embed, Playable } from './types.ts';

const ZILLA = 'https://player.zilla-networks.com';

// Descubierto el 2026-11-02 con probe-headers: de las 4 combinaciones probadas, solo esta
// da 206 en el segmento; con ninguna, referer y referer+origin el segmento da 403.
// No se probó ningún subconjunto intermedio.
export const ZILLA_HEADERS: Record<string, string> = {
  referer: `${ZILLA}/`,
  origin: ZILLA,
  'sec-fetch-site': 'same-origin',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
};

export function resolverZilla(embed: Embed, userAgent: string): Playable | null {
  const m = embed.url.match(/^https:\/\/player\.zilla-networks\.com\/play\/([0-9a-f]+)(?=[/?#]|$)/i);
  if (!m) return null;
  return { url: `${ZILLA}/m3u8/${m[1]}`, headers: { ...ZILLA_HEADERS }, userAgent };
}
