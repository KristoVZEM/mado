export interface TemporizadorConfirmar {
  poner(f: () => void, ms: number): unknown;
  quitar(t: unknown): void;
}

/**
 * Confirmación en dos pasos para una acción destructiva: el primer `pedir(clave)` solo marca la clave
 * (`alCambiar` recibe la clave) y el segundo sobre la misma devuelve `true`. Vuelve sola a `null` pasado
 * `ms` sin confirmar. Pedir otra clave no confirma la anterior.
 */
export function crearConfirmacion<K>(
  alCambiar: (pendiente: K | null) => void,
  ms = 4000,
  temporizador: TemporizadorConfirmar = {
    poner: (f, t) => setTimeout(f, t),
    quitar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  },
) {
  let pendiente: K | null = null;
  let reloj: unknown;

  function limpiar() {
    if (reloj !== undefined) temporizador.quitar(reloj);
    reloj = undefined;
    pendiente = null;
  }

  return {
    /** `true` si ya estaba pedida: hay que ejecutar la acción. */
    pedir(clave: K): boolean {
      if (pendiente !== null && pendiente === clave) {
        limpiar();
        alCambiar(null);
        return true;
      }
      limpiar();
      pendiente = clave;
      alCambiar(clave);
      reloj = temporizador.poner(() => {
        reloj = undefined;
        pendiente = null;
        alCambiar(null);
      }, ms);
      return false;
    },
    cancelar() {
      if (pendiente === null) return;
      limpiar();
      alCambiar(null);
    },
  };
}
