import { normalizar } from '../../../core/src/index.ts';
import type { EntradaBiblioteca } from './datos.ts';

/** Mínimo de letras para buscar (con menos salen demasiados resultados). */
export const MIN_BUSQUEDA = 2;

/** Todas las palabras de `texto` aparecen (sin tildes ni mayúsculas) en `titulo`. */
export function coincide(texto: string, titulo: string): boolean {
  const palabras = normalizar(texto).split(' ').filter(Boolean);
  if (palabras.length === 0) return false;
  const t = normalizar(titulo);
  return palabras.every((p) => t.includes(p));
}

/** Series de tu biblioteca cuyo título coincide, las que estás viendo primero. */
export function seriesDeBiblioteca(texto: string, entradas: readonly EntradaBiblioteca[], max = 12): EntradaBiblioteca[] {
  return entradas
    .filter((e) => coincide(texto, e.titulo))
    .sort((a, b) => Number(b.estado === 1) - Number(a.estado === 1))
    .slice(0, max);
}
