/** Paso de las teclas ↑/↓, en puntos de volumen. */
export const VOLUMEN_PASO = 5;
export const VOLUMEN_INICIAL = 100;

/** Recorta a 0-100 y redondea; un valor no finito da el volumen inicial. */
export function limitarVolumen(n: number): number {
  if (!Number.isFinite(n)) return VOLUMEN_INICIAL;
  return Math.min(100, Math.max(0, Math.round(n)));
}
