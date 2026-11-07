import { Desafio, FuenteCambio, SinRed, SinServidor } from './errors.ts';
import type { Embed, Playable, ResolverServidor } from './types.ts';

/**
 * Recorre los resolutores en orden de prioridad y, para cada uno, los embeds del episodio.
 * Devuelve el primer Playable válido, marcado con el servidor que ganó. Un fallo de forma, de red
 * o un desafío de un resolutor no corta la cadena (se anota como causa). El desafío de animeav1
 * salta antes, en `episodio()`; dentro de la cadena un `Desafio` solo puede venir de un espejo,
 * y significa "ese servidor no sirve", no "la fuente cayó". Cualquier otro error (un bug) sube tal cual.
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
        if (playable) return { embed, playable: { ...playable, servidor: embed.server } };
      } catch (e) {
        if (e instanceof FuenteCambio || e instanceof SinRed || e instanceof Desafio) causas.push(e);
        else throw e;
      }
    }
  }
  throw new SinServidor('ningún servidor resoluble para este episodio', causas);
}
