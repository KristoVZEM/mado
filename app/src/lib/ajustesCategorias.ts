export type CategoriaAjuste = 'reproduccion' | 'apariencia' | 'avisos' | 'datos' | 'cuentas';

export interface Categoria {
  id: CategoriaAjuste;
  nombre: string;
}

/** Orden de las pestañas de Ajustes. Una categoría sin ajustes no debe existir. */
export const CATEGORIAS: readonly Categoria[] = [
  { id: 'reproduccion', nombre: 'Reproducción' },
  { id: 'apariencia', nombre: 'Apariencia' },
  { id: 'avisos', nombre: 'Avisos' },
  { id: 'datos', nombre: 'Datos' },
  { id: 'cuentas', nombre: 'Cuentas' },
];

export function categoriaPorDefecto(): CategoriaAjuste {
  return CATEGORIAS[0].id;
}
