/** Segundos de espera antes de pasar solo al siguiente episodio. */
export const CUENTA_SIGUIENTE_S = 10;

/**
 * Cuenta atrás de `segundos` en segundos enteros: avisa del valor inicial, baja de uno en uno y al
 * llegar a 0 llama a `alTerminar` una sola vez. Devuelve la función que la cancela.
 */
export function iniciarCuentaAtras(
  segundos: number,
  alCambiar: (restantes: number) => void,
  alTerminar: () => void,
): () => void {
  let restantes = segundos;
  alCambiar(restantes);
  const id = setInterval(() => {
    restantes -= 1;
    alCambiar(restantes);
    if (restantes <= 0) {
      clearInterval(id);
      alTerminar();
    }
  }, 1000);
  return () => clearInterval(id);
}
