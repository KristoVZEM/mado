import { urlImagenTmdb } from '../../../core/src/index.ts';
import type { FilaTmdb } from './datos.ts';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Una búsqueda sin resultado se repite pasado este tiempo: TMDB puede haber añadido la serie. */
export const DIAS_REINTENTO_VACIO = 30;
/** Lo encontrado se refresca de tarde en tarde: los fondos y logos cambian poco. */
export const DIAS_REFRESCO = 180;

/**
 * Lo consultado antes de este instante se descarta: es de cuando se elegía el logo en español. Al cambiar el
 * criterio de elección, subir este valor hace que las series se vuelvan a consultar una vez.
 */
export const CRITERIO_DESDE_MS = 1794262127824;

/** Si hay que preguntar a TMDB: nunca se consultó, o lo guardado ya es viejo. */
export function debeConsultar(fila: FilaTmdb | null, ahoraMs: number): boolean {
  if (!fila || fila.consultadoEn < CRITERIO_DESDE_MS) return true;
  const dias = (ahoraMs - fila.consultadoEn) / DIA_MS;
  if (fila.tmdbId === null || (fila.fondo === null && fila.logo === null)) return dias >= DIAS_REINTENTO_VACIO;
  return dias >= DIAS_REFRESCO;
}

/** Fondo 16:9 a tamaño original (suele ser 1920×1080). */
export const urlFondoTmdb = (ruta: string) => urlImagenTmdb(ruta, 'original');
/** Logo del título, de 500 px de ancho. */
export const urlLogoTmdb = (ruta: string) => urlImagenTmdb(ruta, 'w500');
