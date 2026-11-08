/** Paso de las teclas ↑/↓, en puntos de volumen. */
export const VOLUMEN_PASO = 5;
export const VOLUMEN_INICIAL = 100;
const CLAVE = 'ukiku.volumen';

/** Lo mínimo que se usa de `Storage`: así los tests no dependen del navegador. */
export type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

/** Recorta a 0-100 y redondea; un valor no finito da el volumen inicial. */
export function limitarVolumen(n: number): number {
  if (!Number.isFinite(n)) return VOLUMEN_INICIAL;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Volumen guardado, o el inicial si no hay almacén, está vacío, es basura o el acceso falla. */
export function leerVolumen(almacen: Almacen | undefined): number {
  try {
    const crudo = almacen?.getItem(CLAVE);
    if (crudo == null || crudo.trim() === '') return VOLUMEN_INICIAL;
    return limitarVolumen(Number(crudo));
  } catch {
    return VOLUMEN_INICIAL;
  }
}

/** Guarda el volumen; si el almacén no está disponible o está lleno, no pasa nada. */
export function guardarVolumen(almacen: Almacen | undefined, volumen: number): void {
  try {
    almacen?.setItem(CLAVE, String(limitarVolumen(volumen)));
  } catch {
    // Es una comodidad: sin almacén simplemente no se recuerda.
  }
}
