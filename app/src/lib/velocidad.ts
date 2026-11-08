/** Velocidades que ofrece el desplegable, de más lenta a más rápida. */
export const VELOCIDADES = [0.75, 1, 1.25, 1.5, 2] as const;

/** `1.25` -> `1,25×` (coma decimal, signo de multiplicar). */
export function etiquetaVelocidad(v: number): string {
  return `${String(v).replace('.', ',')}×`;
}
