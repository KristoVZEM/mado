import { Desafio, SinRed } from '../../../core/src/errors.ts';

/** Por qué la fuente (animeav1) no se puede usar ahora: no responde, o Cloudflare pide un desafío. */
export type CausaFuente = 'red' | 'desafio';

/** `null` si el error no es un bloqueo de la fuente (un cambio de formato, por ejemplo, no lo es). */
export function causaDeFalloDeFuente(e: unknown): CausaFuente | null {
  if (e instanceof Desafio) return 'desafio';
  if (e instanceof SinRed) return 'red';
  return null;
}

const LOCAL = 'Biblioteca, Historial y Emisión siguen funcionando.';

/** Texto del aviso que se ve en toda la app mientras la fuente no responde. */
export function textoAvisoFuente(causa: CausaFuente): string {
  return causa === 'desafio'
    ? `La fuente está pidiendo un desafío de Cloudflare. ${LOCAL} Prueba a cambiar de red y reintenta.`
    : `La fuente no responde ahora. ${LOCAL} Revisa la conexión o prueba con otra red.`;
}
