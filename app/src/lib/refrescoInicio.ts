/** Pasado este tiempo desde el último intento, Inicio vuelve a pedir sus datos al volver a verse la ventana. */
export const REFRESCO_MS = 10 * 60_000;
/** Dos avisos de «la ventana se ve» (visibilidad y foco) llegan casi a la vez: como mucho un intento cada 30 s. */
export const MIN_ENTRE_INTENTOS_MS = 30_000;

export interface EntradaRefresco {
  ahora: number;
  /** Milisegundos del último intento de carga (bien o mal); 0 si nunca hubo uno. */
  ultimoIntentoMs: number;
  /** La última carga falló o no trajo datos (por ejemplo, sin red justo tras encender el PC). */
  fallo: boolean;
}

/**
 * ¿Hay que volver a pedir los datos de Inicio al mostrarse la ventana? Sí si pasaron 10 minutos o si la última carga
 * falló, salvo que el último intento fuera hace menos de 30 s. Sin intentos previos, o con el reloj atrasado, sí.
 */
export function debeRefrescar(e: EntradaRefresco): boolean {
  if (e.ultimoIntentoMs <= 0 || e.ultimoIntentoMs > e.ahora) return true;
  const desde = e.ahora - e.ultimoIntentoMs;
  if (desde < MIN_ENTRE_INTENTOS_MS) return false;
  return e.fallo || desde >= REFRESCO_MS;
}
