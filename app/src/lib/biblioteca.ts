import type { Biblioteca, EntradaBiblioteca } from './datos.ts';

/** Estados de seguimiento de Ukiku (los mismos números que guarda su copia). */
export const ESTADOS = [
  { valor: 1, nombre: 'Viendo' },
  { valor: 2, nombre: 'Considerando' },
  { valor: 3, nombre: 'Completado' },
  { valor: 4, nombre: 'Dropeado' },
  { valor: 5, nombre: 'Pausado' },
] as const;

/** Nombre de un estado; "Sin estado" si la serie no se sigue (o el valor no es conocido). */
export function nombreEstado(estado: number | null): string {
  return ESTADOS.find((x) => x.valor === estado)?.nombre ?? 'Sin estado';
}

export type Pestana = 'todos' | 'viendo' | 'considerando' | 'completado' | 'dropeado' | 'pausado';

/** El id `todos` se queda por compatibilidad (Catálogo, Emisión e Inicio lo usan con `entradasDe`). */
export const PESTANAS: readonly { id: Pestana; nombre: string; estado?: number }[] = [
  { id: 'todos', nombre: 'Todas' },
  { id: 'viendo', nombre: 'Viendo', estado: 1 },
  { id: 'considerando', nombre: 'Considerando', estado: 2 },
  { id: 'completado', nombre: 'Completado', estado: 3 },
  { id: 'dropeado', nombre: 'Dropeado', estado: 4 },
  { id: 'pausado', nombre: 'Pausado', estado: 5 },
];

/** Las entradas seguidas de una pestaña, sin ordenar. Todos = todo `siguiendo` (los favoritos sin estado, no). */
export function filtrar(b: Biblioteca, p: Pestana): EntradaBiblioteca[] {
  if (p === 'todos') return b.siguiendo;
  const estado = PESTANAS.find((x) => x.id === p)?.estado;
  return b.siguiendo.filter((x) => x.estado === estado);
}

/** Pestaña a la que lleva una tecla del `tablist` (flechas con vuelta, Inicio, Fin); `null` si la tecla no mueve. */
export function pestanaVecina(actual: Pestana, tecla: string): Pestana | null {
  const n = PESTANAS.length;
  const i = PESTANAS.findIndex((p) => p.id === actual);
  const destino =
    tecla === 'ArrowRight' ? (i + 1) % n : tecla === 'ArrowLeft' ? (i - 1 + n) % n : tecla === 'Home' ? 0 : tecla === 'End' ? n - 1 : -1;
  return destino < 0 ? null : PESTANAS[destino].id;
}

/** Copia ordenada por título según el español (la Ñ tras la N, los acentos con su letra). */
export function ordenarPorTitulo(lista: readonly EntradaBiblioteca[]): EntradaBiblioteca[] {
  return [...lista].sort((a, z) => a.titulo.localeCompare(z.titulo, 'es') || a.aid - z.aid);
}

export function entradasDe(b: Biblioteca, p: Pestana): EntradaBiblioteca[] {
  return ordenarPorTitulo(filtrar(b, p));
}

/** Recuento de cada pestaña. */
export function recuentos(b: Biblioteca): Record<Pestana, number> {
  return Object.fromEntries(PESTANAS.map((p) => [p.id, filtrar(b, p.id).length])) as Record<Pestana, number>;
}

/** "Último visto: Ep. N", o `null` si la serie no tiene ningún episodio en el historial. */
export function textoUltimoVisto(n: number | null): string | null {
  return n === null ? null : `Último visto: Ep. ${n}`;
}
