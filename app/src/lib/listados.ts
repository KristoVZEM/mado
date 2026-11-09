import type { OpcionesCatalogo, ResultadoBusqueda } from '../../../core/src/index.ts';

export type ListadoId = 'populares' | 'recientes';

/** Las filas del Catálogo al entrar, en el orden en que se ven. Lo que se emite hoy está en la pestaña Emisión. */
export const LISTADOS: readonly { id: ListadoId; titulo: string; opciones: OpcionesCatalogo }[] = [
  { id: 'populares', titulo: 'Populares', opciones: { orden: 'popular' } },
  { id: 'recientes', titulo: 'Añadidos recientemente', opciones: {} },
];

export function tituloDe(id: ListadoId): string {
  return LISTADOS.find((l) => l.id === id)?.titulo ?? '';
}

/** Junta una página nueva a lo ya cargado sin repetir series (el orden de la fuente puede mover una entre páginas). */
export function sinRepetidos(actual: readonly ResultadoBusqueda[], nuevos: readonly ResultadoBusqueda[]): ResultadoBusqueda[] {
  const vistos = new Set(actual.map((r) => r.aid));
  const salida = [...actual];
  for (const r of nuevos) {
    if (vistos.has(r.aid)) continue;
    vistos.add(r.aid);
    salida.push(r);
  }
  return salida;
}
