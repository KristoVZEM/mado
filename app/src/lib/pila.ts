// Historial de fichas: lo que hace falta para que «Volver» regrese a la ficha anterior (por ejemplo, tras
// abrir una serie relacionada) y no directamente a la sección. Funciones puras; el estado vive en `navegacion`.

/** Lo mínimo que la pila necesita saber de lo que hay abierto encima de una sección. */
export interface Abierto {
  tipo: 'ficha' | 'reproducir';
  anime: { aid: number };
}

/** Fichas que se recuerdan como mucho; al pasar el tope se olvida la más antigua. */
export const TOPE_PILA = 30;

/**
 * La pila tras abrir `nuevo` estando en `actual`. Solo se apila al pasar de una ficha a la de OTRA serie:
 * entrar al Reproductor, volver de él o reabrir la misma ficha no añaden nada.
 */
export function pilaAlAbrir<T extends Abierto>(pila: readonly T[], actual: T | null, nuevo: Abierto): T[] {
  if (actual?.tipo !== 'ficha' || nuevo.tipo !== 'ficha' || actual.anime.aid === nuevo.anime.aid) return [...pila];
  return [...pila, actual].slice(-TOPE_PILA);
}

/** A dónde lleva «Volver»: a la última ficha apilada o, sin ninguna, a la sección (`destino` nulo). */
export function pilaAlVolver<T extends Abierto>(pila: readonly T[]): { pila: T[]; destino: T | null } {
  if (pila.length === 0) return { pila: [], destino: null };
  return { pila: pila.slice(0, -1), destino: pila[pila.length - 1] };
}
