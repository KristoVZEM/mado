/** A cuántos segundos del final aparece el botón de "Siguiente episodio". */
export const AVISO_SIGUIENTE_S = 20;
/** A cuántos segundos del final se pasa solo al siguiente episodio. */
export const SALTO_SIGUIENTE_S = 2;
/** Por debajo de esta duración no hay botón ni salto automático (clips, duración mal leída). */
export const DURACION_MINIMA_S = 60;

export interface EstadoSiguiente {
  /** El botón debe verse. */
  visible: boolean;
  /** Relleno del botón, de 0 (recién aparecido) a 1 (hora de saltar). */
  progreso: number;
  /** Hay que pasar ya al siguiente episodio. */
  saltar: boolean;
}

const NADA: EstadoSiguiente = { visible: false, progreso: 0, saltar: false };

/**
 * Qué mostrar según el punto del episodio, como Netflix: el botón aparece `AVISO_SIGUIENTE_S`
 * antes del final, se rellena a ritmo del tiempo real y a `SALTO_SIGUIENTE_S` del final salta.
 * Como depende de la posición, pausar lo congela y retroceder lo oculta y lo reinicia.
 */
export function estadoSiguiente(posicion: number, duracion: number): EstadoSiguiente {
  if (!Number.isFinite(posicion) || !Number.isFinite(duracion) || duracion < DURACION_MINIMA_S) return NADA;
  const restante = duracion - posicion;
  if (restante > AVISO_SIGUIENTE_S || posicion < 0) return NADA;
  const recorrido = AVISO_SIGUIENTE_S - Math.max(restante, SALTO_SIGUIENTE_S);
  return {
    visible: true,
    progreso: recorrido / (AVISO_SIGUIENTE_S - SALTO_SIGUIENTE_S),
    saltar: restante <= SALTO_SIGUIENTE_S,
  };
}
