export type Seccion = 'inicio' | 'catalogo' | 'emision' | 'biblioteca' | 'historial' | 'ajustes';

export interface ElementoCarril {
  id: Seccion;
  nombre: string;
}

/** Orden del carril. Cada sección se añade cuando existe. */
export const CARRIL: readonly ElementoCarril[] = [
  { id: 'inicio', nombre: 'Inicio' },
  { id: 'catalogo', nombre: 'Catálogo' },
  { id: 'emision', nombre: 'Emisión' },
  { id: 'biblioteca', nombre: 'Biblioteca' },
  { id: 'historial', nombre: 'Historial' },
  { id: 'ajustes', nombre: 'Ajustes' },
];

export const SECCION_INICIAL: Seccion = 'inicio';
