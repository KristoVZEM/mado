/**
 * Tareas que deben terminar antes de cerrar la ventana (guardar el progreso, vaciar un guardado
 * retrasado). Cada una se registra con `alCerrar` y se quita al terminar su pantalla.
 */
type Tarea = () => Promise<void> | void;

const tareas = new Set<Tarea>();

/** Registra una tarea de cierre; devuelve la función que la quita. */
export function alCerrar(tarea: Tarea): () => void {
  tareas.add(tarea);
  return () => void tareas.delete(tarea);
}

/** Espera a `promesa` como mucho `ms`: si se agota o falla devuelve `undefined`. Nunca lanza. */
export async function esperarConTope<T>(promesa: Promise<T>, ms: number): Promise<T | undefined> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<undefined>((r) => {
    temporizador = setTimeout(() => r(undefined), ms);
  });
  try {
    return await Promise.race([promesa.catch(() => undefined), tope]);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Corre todas las tareas de cierre a la vez y espera como mucho `topeMs`: la ventana nunca se cuelga. */
export async function ejecutarAlCerrar(topeMs = 1500): Promise<void> {
  const todas = [...tareas].map(async (t) => {
    try {
      await t();
    } catch (e) {
      console.error('tarea de cierre:', e instanceof Error ? e.name : e);
    }
  });
  await esperarConTope(Promise.all(todas), topeMs);
}
