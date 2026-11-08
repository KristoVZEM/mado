export type Seccion = 'inicio' | 'catalogo' | 'biblioteca' | 'historial' | 'ajustes';

export interface ElementoCarril {
  id: Seccion;
  nombre: string;
}

/** Orden del carril. Cada sección se añade cuando existe; Emisión no aparece hasta entonces. */
export const CARRIL: readonly ElementoCarril[] = [
  { id: 'catalogo', nombre: 'Catálogo' },
  { id: 'biblioteca', nombre: 'Biblioteca' },
  { id: 'ajustes', nombre: 'Ajustes' },
];

export const SECCION_INICIAL: Seccion = 'catalogo';
