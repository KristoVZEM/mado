import { numeroDeAjuste } from './ajustes.ts';

/** `avisos_intervalo`: cada cuánto se miran los avisos. El valor guardado es la posición en esta lista. */
export const INTERVALOS_AVISOS = [
  { minutos: 15, nombre: 'Cada 15 minutos' },
  { minutos: 30, nombre: 'Cada 30 minutos' },
  { minutos: 60, nombre: 'Cada hora' },
  { minutos: 120, nombre: 'Cada 2 horas' },
  { minutos: 360, nombre: 'Cada 6 horas' },
] as const;

/** `avisos_alcance`: qué series se vigilan. */
export const ALCANCES_AVISOS = [
  { nombre: 'Solo lo que estoy viendo', incluirFavoritas: false },
  { nombre: 'Lo que estoy viendo y mis favoritas', incluirFavoritas: true },
] as const;

export const LIMITES_AVISOS = {
  intervalo: [0, INTERVALOS_AVISOS.length - 1],
  alcance: [0, ALCANCES_AVISOS.length - 1],
} as const;

/** Posición del intervalo guardado; ausente o inválido = cada 30 minutos, como hasta ahora. */
export function intervaloAvisosDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 1, ...LIMITES_AVISOS.intervalo);
}

export function intervaloAvisosMs(posicion: number): number {
  return (INTERVALOS_AVISOS[posicion] ?? INTERVALOS_AVISOS[1]).minutos * 60_000;
}

/** Posición del alcance guardado; ausente o inválido = solo lo que estoy viendo. */
export function alcanceAvisosDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 0, ...LIMITES_AVISOS.alcance);
}

export function incluirFavoritasDe(posicion: number): boolean {
  return (ALCANCES_AVISOS[posicion] ?? ALCANCES_AVISOS[0]).incluirFavoritas;
}

// `cerrar_a_bandeja`: ausente o inválido = no; solo `1` lo activa.
export function cerrarABandejaDe(valor: string | null | undefined): boolean {
  return numeroDeAjuste(valor, 0, 0, 1) === 1;
}
