import { FuenteCambio, SinRed, SinServidor } from './errors.ts';
import type { Embed, Playable, ResolverServidor } from './types.ts';

/**
 * Recorre los resolutores en orden de prioridad y, para cada uno, los embeds del episodio.
 * Devuelve el primer Playable válido. Un fallo de forma o de red de un resolutor no corta
 * la cadena (se anota como causa); un desafío de Cloudflare sí sube tal cual.
 */
export async function resolverPrimero(
  embeds: Embed[],
  resolvers: ResolverServidor[],
  userAgent: string,
): Promise<{ embed: Embed; playable: Playable }> {
  const causas: Error[] = [];
  for (const resolver of resolvers) {
    for (const embed of embeds) {
      try {
        const playable = await resolver(embed, userAgent);
        if (playable) return { embed, playable };
      } catch (e) {
        if (e instanceof FuenteCambio || e instanceof SinRed) causas.push(e);
        else throw e;
      }
    }
  }
  throw new SinServidor('ningún servidor resoluble para este episodio', causas);
}
