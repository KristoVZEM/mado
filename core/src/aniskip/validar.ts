// Los tiempos de AniSkip los envía cualquiera, sin cuenta, y su esquema solo garantiza números >= 0. Esta función
// los trata como datos no fiables: solo deja pasar un opening plausible y del mismo corte que el vídeo que suena.

export interface TramoIntro {
  /** Segundo del vídeo en que empieza el opening. */
  inicio: number;
  /** Segundo en que acaba; a donde salta el botón. */
  fin: number;
}

/** Un opening de menos de 5 s o de más de 300 s no es un opening. */
export const MIN_TRAMO_S = 5;
export const MAX_TRAMO_S = 300;
/** Los envíos son de un corte concreto del vídeo; se aceptan los de hasta 3 s de diferencia. */
export const TOLERANCIA_CORTE_S = 3;

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Elige el opening de una respuesta de `GET /v2/skip-times`. `duracion` es la que da mpv, en segundos.
 * Si hay varios válidos gana el de `episodeLength` más cercano a `duracion` (en empate, el primero).
 * Se ignoran `message`, `skipId` y todo tipo que no sea `op`.
 */
export function validarIntro(respuesta: unknown, duracion: number): TramoIntro | null {
  if (!finito(duracion) || duracion <= 0) return null;
  const lista = (respuesta as { results?: unknown } | null | undefined)?.results;
  if (!Array.isArray(lista)) return null;
  let mejor: { tramo: TramoIntro; distancia: number } | null = null;
  for (const r of lista) {
    if (r === null || typeof r !== 'object') continue;
    const { skipType, interval, episodeLength } = r as Record<string, any>;
    if (skipType !== 'op') continue;
    const inicio = interval?.startTime;
    const fin = interval?.endTime;
    if (!finito(inicio) || !finito(fin) || !finito(episodeLength)) continue;
    if (inicio < 0 || inicio >= fin || fin > duracion + 1) continue;
    const largo = fin - inicio;
    if (largo < MIN_TRAMO_S || largo > MAX_TRAMO_S) continue;
    const distancia = Math.abs(episodeLength - duracion);
    if (distancia > TOLERANCIA_CORTE_S) continue;
    if (mejor === null || distancia < mejor.distancia) mejor = { tramo: { inicio, fin }, distancia };
  }
  return mejor?.tramo ?? null;
}
