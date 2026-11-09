import type { OpcionesCatalogo, ResultadoBusqueda } from '../../../core/src/index.ts';

export type ListadoId = 'emision' | 'populares' | 'recientes';

/** Las filas del Catálogo al entrar, en el orden en que se ven. */
export const LISTADOS: readonly { id: ListadoId; titulo: string; opciones: OpcionesCatalogo }[] = [
  { id: 'emision', titulo: 'En emisión', opciones: { estado: 'emision', orden: 'score' } },
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
