import { limitarVolumen } from './volumen.ts';

/** Rangos válidos de cada ajuste numérico: los mismos que valida Rust. */
export const LIMITES = {
  volumen: [0, 100],
  saltoCorto: [5, 60],
  saltoLargo: [30, 180],
  velocidad: [0.5, 3],
} as const;

/**
 * Lee un ajuste numérico guardado como texto: `Number()` tras `trim`, y el valor por defecto si
 * falta, no es un número finito o sale del rango. Los ajustes se guardan tal cual llegaron
 * (p. ej. con espacios), así que quien los lee debe ser defensivo.
 */
export function numeroDeAjuste(
  valor: string | null | undefined,
  defecto: number,
  min: number,
  max: number,
): number {
  if (valor == null || valor.trim() === '') return defecto;
  const n = Number(valor.trim());
  return Number.isFinite(n) && n >= min && n <= max ? n : defecto;
}

/**
 * Volumen con el que arrancar: el de la base si es válido; si no, el que quedó en `localStorage` de
 * antes de existir la base (`migrar: true` pide guardarlo en la base una sola vez); si no, 100.
 */
export function volumenInicial(db: string | null, local: string | null): { valor: number; migrar: boolean } {
  const [min, max] = LIMITES.volumen;
  const deDb = numeroDeAjuste(db, Number.NaN, min, max);
  if (!Number.isNaN(deDb)) return { valor: limitarVolumen(deDb), migrar: false };
  const deLocal = Number(local?.trim() ?? '');
  if (local != null && local.trim() !== '' && Number.isFinite(deLocal)) {
    return { valor: limitarVolumen(deLocal), migrar: true };
  }
  return { valor: 100, migrar: false };
}
