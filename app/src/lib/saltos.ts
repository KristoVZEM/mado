/** Salto corto del reproductor, en segundos. */
export const SALTO_CORTO_S = 10;
/** Salto largo (pasar el opening), en segundos: el mismo que usa Ukiku. */
export const SALTO_LARGO_S = 85;

/** Formatea segundos como m:ss, o h:mm:ss desde una hora. Valores negativos o no finitos dan 0:00. */
export function formatearTiempo(segundos: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(segundos) ? segundos : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Segundo del vídeo que corresponde a la coordenada `x` del cursor sobre una barra que empieza en
 * `izquierda` y mide `ancho` píxeles. Fuera de la barra se recorta a 0 o a la duración.
 */
export function tiempoEnPosicion(x: number, izquierda: number, ancho: number, duracion: number): number {
  if (!(ancho > 0) || !Number.isFinite(duracion) || duracion <= 0) return 0;
  const fraccion = Math.min(1, Math.max(0, (x - izquierda) / ancho));
  return fraccion * duracion;
}

// Segundo al que lleva una tecla numérica (fila de números o teclado numérico): 0 = principio, 5 = la mitad,
// 9 = el 90 %. `null` si la tecla no es un dígito o aún no se conoce la duración.
export function tiempoDeDigito(codigo: string, duracion: number): number | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(codigo);
  if (!m || !Number.isFinite(duracion) || duracion <= 0) return null;
  return (Number(m[1]) / 10) * duracion;
}
