import type { Idioma, Playable } from '../../../core/src/index.ts';

/**
 * Argumentos del comando `loadfile` de mpv. Con `inicio` positivo añade `start=<s>`; mpv exige
 * entonces `flags` e índice antes de las opciones (`replace`, `-1` = sin índice).
 */
export function argumentosLoadfile(url: string, inicio?: number): string[] {
  if (inicio === undefined || !Number.isFinite(inicio) || inicio <= 0) return [url];
  return [url, 'replace', '-1', `start=${inicio}`];
}

export interface CambioDeIdioma {
  nuevo: Idioma;
  /** Segundo en el que estaba el vídeo actual. */
  posicion: number;
  resolver: (idioma: Idioma) => Promise<Playable>;
  cargar: (playable: Playable, inicio: number) => Promise<void>;
}

/**
 * Cambia de idioma sin perder el sitio. Resuelve primero: si el idioma nuevo no existe o falla, no
 * se llega a cargar nada y el vídeo actual sigue reproduciéndose.
 */
export async function cambiarIdioma(c: CambioDeIdioma): Promise<Playable> {
  const playable = await c.resolver(c.nuevo);
  await c.cargar(playable, c.posicion);
  return playable;
}
