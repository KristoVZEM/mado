/**
 * Cola de ejecución en serie: cada tarea empieza cuando termina la anterior, haya salido bien o
 * mal. El reproductor la usa para que `cargar` y `detener` no se crucen: un `stop` tardío no puede
 * dejar parado el episodio nuevo, ni un `loadfile` tardío reanudar uno que ya se abandonó.
 */
export function crearCola(): <T>(tarea: () => Promise<T>) => Promise<T> {
  let cola: Promise<unknown> = Promise.resolve();
  return <T>(tarea: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(tarea);
    // La cola sigue aunque la tarea falle; el error le llega a quien la pidió.
    cola = resultado.catch(() => {});
    return resultado;
  };
}
