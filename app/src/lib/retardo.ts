/** Reloj inyectable para las pruebas; por defecto, `setTimeout`. */
export interface RelojRetardo {
  poner(f: () => void, ms: number): unknown;
  quitar(t: unknown): void;
}

const RELOJ_REAL: RelojRetardo = {
  poner: (f, ms) => setTimeout(f, ms),
  quitar: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/**
 * Guarda solo el último valor, `ms` después de la última llamada (retraso al final). `vaciar` guarda ya
 * el valor pendiente, para no perderlo al cerrar la ventana.
 */
export function crearRetardo<T>(guardar: (v: T) => void, ms: number, reloj: RelojRetardo = RELOJ_REAL) {
  let temporizador: unknown;
  let pendiente: { v: T } | null = null;

  function soltar() {
    if (temporizador !== undefined) reloj.quitar(temporizador);
    temporizador = undefined;
    if (pendiente) {
      const { v } = pendiente;
      pendiente = null;
      guardar(v);
    }
  }

  return {
    llamar(v: T) {
      pendiente = { v };
      if (temporizador !== undefined) reloj.quitar(temporizador);
      temporizador = reloj.poner(soltar, ms);
    },
    vaciar: soltar,
  };
}
