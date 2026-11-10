/** Fracción de la duración a partir de la cual un episodio cuenta como visto (los últimos minutos suelen ser avance o créditos). */
export const UMBRAL_VISTO = 0.85;
/** Por debajo de esta posición guardada no se ofrece retomar: se empieza desde el principio. */
export const MIN_RETOMAR_S = 60;
/** Tiempo máximo entre guardados mientras se reproduce. */
export const INTERVALO_GUARDADO_MS = 10_000;
/** Un salto de posición mayor que esto (respecto a lo esperado) se guarda al momento. */
export const SALTO_GRANDE_S = 5;

export function esVisto(posicion: number, duracion: number): boolean {
  return (
    Number.isFinite(posicion) && Number.isFinite(duracion) && duracion > 0 && posicion / duracion >= UMBRAL_VISTO
  );
}

/** Segundo desde el que retomar: lo guardado si es de al menos `MIN_RETOMAR_S`, si no 0. */
export function posicionDeRetoma(guardada: number | null | undefined): number {
  if (guardada == null || !Number.isFinite(guardada) || guardada < MIN_RETOMAR_S) return 0;
  return guardada;
}

export interface EstadoGuardado {
  ahoraMs: number;
  /** Momento del último guardado. */
  ultimoMs: number;
  posicion: number;
  /** Posición en el último guardado. */
  ultimaPosicion: number;
  velocidad: number;
}

/**
 * ¿Toca guardar ya? Sí a los `INTERVALO_GUARDADO_MS` del último guardado, o si la posición se
 * desvía de la esperada (la anterior más el tiempo transcurrido por la velocidad) en más de
 * `SALTO_GRANDE_S`: un salto en la barra. Nunca antes de 1 s desde el último guardado.
 */
export function debeGuardar(e: EstadoGuardado): boolean {
  if (!Number.isFinite(e.posicion) || e.posicion <= 0) return false;
  const transcurridoMs = e.ahoraMs - e.ultimoMs;
  if (transcurridoMs >= INTERVALO_GUARDADO_MS) return true;
  if (transcurridoMs < 1000) return false;
  const velocidad = e.velocidad > 0 ? e.velocidad : 1;
  const esperada = e.ultimaPosicion + (transcurridoMs / 1000) * velocidad;
  return Math.abs(e.posicion - esperada) > SALTO_GRANDE_S;
}

/**
 * Episodios de la lista con número menor que `numero`, sin repetidos y de menor a mayor: son los
 * que se marcan también como vistos al marcar `numero`. Salen siempre de la lista de episodios.
 * En series enormes solo se devuelven los últimos `MAX_ANTERIORES` (los más cercanos a `numero`).
 */
export function anterioresDe(numeros: number[], numero: number): number[] {
  const unicos = new Set(numeros.filter((n) => Number.isFinite(n) && n >= 0 && n < numero));
  return [...unicos].sort((a, b) => a - b).slice(-MAX_ANTERIORES);
}

/** Tope de episodios anteriores que se marcan de una vez como vistos. */
export const MAX_ANTERIORES = 5000;
