/**
 * Fracción (0 a 1) de la barra de progreso que ya está descargada. `hasta` es el segundo hasta el que llega
 * la caché de mpv (`demuxer-cache-time`), o `null` si no lo informa. Nunca queda por detrás de la posición.
 */
export function fraccionAlmacenada(hasta: number | null, posicion: number, duracion: number): number {
  if (!(duracion > 0) || hasta === null || !Number.isFinite(hasta)) return 0;
  const tope = Math.max(hasta, Number.isFinite(posicion) ? posicion : 0);
  return Math.min(1, Math.max(0, tope / duracion));
}

/** El vídeo está parado esperando datos: mpv se quedó sin caché o está saltando a otro punto. */
export function estaEsperandoDatos(e: { pausadoPorCache: boolean; saltando: boolean; terminado: boolean }): boolean {
  return !e.terminado && (e.pausadoPorCache || e.saltando);
}

/** Servidores a evitar tras un fallo: los de antes más el que acaba de fallar, sin repetir. */
export function conExcluido(excluidos: readonly string[], servidor: string | undefined): string[] {
  if (servidor === undefined || excluidos.includes(servidor)) return [...excluidos];
  return [...excluidos, servidor];
}
