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

export type Pestana = 'todos' | 'viendo' | 'considerando' | 'completado' | 'dropeado' | 'pausado' | 'favoritos';

export const PESTANAS: readonly { id: Pestana; nombre: string; estado?: number }[] = [
  { id: 'todos', nombre: 'Todos' },
  { id: 'viendo', nombre: 'Viendo', estado: 1 },
  { id: 'considerando', nombre: 'Considerando', estado: 2 },
  { id: 'completado', nombre: 'Completado', estado: 3 },
  { id: 'dropeado', nombre: 'Dropeado', estado: 4 },
  { id: 'pausado', nombre: 'Pausado', estado: 5 },
  { id: 'favoritos', nombre: 'Favoritos' },
];

/** Las entradas de una pestaña, sin ordenar. Todos = todo `siguiendo`. */
export function filtrar(b: Biblioteca, p: Pestana): EntradaBiblioteca[] {
  if (p === 'favoritos') return b.favoritos;
  if (p === 'todos') return b.siguiendo;
  const estado = PESTANAS.find((x) => x.id === p)?.estado;
  return b.siguiendo.filter((x) => x.estado === estado);
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

/** En Todos y Favoritos se mezclan estados, así que cada fila muestra el suyo. */
export function muestraEstado(p: Pestana): boolean {
  return p === 'todos' || p === 'favoritos';
}

/** Texto cuando la pestaña no tiene series. */
export function textoVacio(p: Pestana): string {
  if (p === 'todos') {
    return 'Todavía no sigues ninguna serie. Importa tu copia de Ukiku desde Ajustes o elige un estado en la ficha de una serie.';
  }
  if (p === 'favoritos') return 'Todavía no tienes favoritos. Márcalos con ☆ en la ficha de una serie.';
  return `No hay series en «${PESTANAS.find((x) => x.id === p)?.nombre}».`;
}
