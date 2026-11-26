import type { EntradaBiblioteca } from './datos.ts';

/** Una serie tal como la enseña la Biblioteca: lo de Rust más si está en favoritos. */
export interface EntradaVista extends EntradaBiblioteca {
  favorito: boolean;
}

export type Orden = 'ultimo' | 'progreso' | 'puntuacion' | 'titulo';

/** En el orden del ajuste `biblioteca_orden` (la posición es el número guardado). */
export const ORDENES: readonly { id: Orden; nombre: string }[] = [
  { id: 'ultimo', nombre: 'Último visto' },
  { id: 'progreso', nombre: 'Progreso' },
  { id: 'puntuacion', nombre: 'Puntuación' },
  { id: 'titulo', nombre: 'Título' },
];

/** Del valor guardado al orden; cualquier cosa que no sea 0-3 es «último visto». */
export function ordenDe(valor: string | null): Orden {
  const n = Number(valor ?? '');
  return Number.isInteger(n) && n >= 0 && n < ORDENES.length ? ORDENES[n].id : 'ultimo';
}

export function valorDeOrden(o: Orden): string {
  return String(Math.max(0, ORDENES.findIndex((x) => x.id === o)));
}

/** Parte vista (0-1); `null` si no se conoce el total o no se ha visto nada. */
export function fraccion(e: EntradaBiblioteca): number | null {
  if (e.total === null || e.total <= 0 || e.vistos <= 0) return null;
  return Math.min(e.vistos / e.total, 1);
}

const porTitulo = (a: EntradaBiblioteca, z: EntradaBiblioteca) => a.titulo.localeCompare(z.titulo, 'es') || a.aid - z.aid;

/** Comparador de mayor a menor con los `null` al final. */
function descendente(valor: (e: EntradaVista) => number | null) {
  return (a: EntradaVista, z: EntradaVista): number => {
    const x = valor(a);
    const y = valor(z);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return y - x;
  };
}

const CLAVES: Record<Orden, (a: EntradaVista, z: EntradaVista) => number> = {
  ultimo: descendente((e) => e.vistoEn),
  progreso: descendente(fraccion),
  puntuacion: descendente((e) => e.puntuacion),
  titulo: () => 0,
};

/** Copia ordenada; los empates siempre por título y después por `aid`. */
export function ordenar(lista: readonly EntradaVista[], o: Orden): EntradaVista[] {
  return [...lista].sort((a, z) => CLAVES[o](a, z) || porTitulo(a, z));
}
