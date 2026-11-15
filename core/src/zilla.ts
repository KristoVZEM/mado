import { FuenteCambio } from './errors.ts';
import type { Http } from './http.ts';
import type { Embed, Playable, ResolverServidor } from './types.ts';

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

/**
 * Zilla con comprobación previa: pide la lista con las mismas cabeceras que usará mpv y exige un
 * `#EXTM3U`. Sin esto, un Zilla caído o bloqueado se descubre dentro de mpv, cuando la cadena ya
 * no puede pasar a MP4Upload. Una respuesta que no es lista cuenta como "ese servidor no
 * sirve" (`FuenteCambio`); los fallos de red (`SinRed`) y desafíos suben tal cual a la cadena.
 */
export function crearResolverZilla(http: Http): ResolverServidor {
  return async (embed, userAgent) => {
    const playable = resolverZilla(embed, userAgent);
    if (!playable) return null;
    const res = await http.get(playable.url, { headers: { ...playable.headers } });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new FuenteCambio(`zilla: la lista respondió HTTP ${res.status}`);
    }
    const inicio = (await res.text()).trimStart();
    if (!inicio.startsWith('#EXTM3U')) throw new FuenteCambio('zilla: la respuesta no es una lista HLS');
    return playable;
  };
}
