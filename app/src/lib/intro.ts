import { numeroDeAjuste } from './ajustes.ts';
import type { TramoIntro } from '../../../core/src/index.ts';

export type { TramoIntro };

/** El botón desaparece justo antes del final del opening: pulsarlo ahí ya no aporta nada. */
export const MARGEN_FIN_S = 2;

/** ¿Está la posición dentro del opening, con tiempo suficiente para que el botón valga la pena? */
export function introVisible(posicion: number, tramo: TramoIntro | null): boolean {
  if (tramo === null || !Number.isFinite(posicion)) return false;
  return posicion >= tramo.inicio && posicion < tramo.fin - MARGEN_FIN_S;
}

/** `aniskip_activo`: ausente o inválido = no; solo `1` lo activa (consultar a AniSkip es voluntario). */
export function aniskipActivoDe(valor: string | null | undefined): boolean {
  return numeroDeAjuste(valor, 0, 0, 1) === 1;
}

/** AniSkip numera por entero y necesita el id de MyAnimeList y la duración: sin ellos no se pregunta. */
export function consultable(malId: number | null | undefined, episodio: number, duracion: number): boolean {
  return (
    Number.isInteger(malId) && (malId as number) >= 1 && Number.isInteger(episodio) && episodio >= 0 &&
    Number.isFinite(duracion) && duracion > 0
  );
}

/** Clave de la caché: la duración redondeada al segundo (los tiempos son de un corte del vídeo). */
export function duracionClave(duracion: number): number {
  return Math.round(duracion);
}

/** ¿La duración nueva es de otro corte que aquella con la que se consultó? Más de 1 s de diferencia. */
export function cambioDeCorte(anterior: number | null, nueva: number): boolean {
  return anterior === null || Math.abs(nueva - anterior) > 1;
}
