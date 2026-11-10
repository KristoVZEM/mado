import { numeroDeAjuste } from './ajustes.ts';

/** `redimension`: cómo encaja el vídeo en la ventana. Los valores guardados son las posiciones de esta lista. */
export const REDIMENSIONES = [
  { nombre: 'Ajustar (con barras si hace falta)', mantenerProporcion: true, panscan: 0 },
  { nombre: 'Llenar la ventana (recorta los bordes)', mantenerProporcion: true, panscan: 1 },
  { nombre: 'Estirar (deforma la imagen)', mantenerProporcion: false, panscan: 0 },
] as const;

/** `hwdec`: si el vídeo se decodifica con la tarjeta gráfica o con el procesador; `valor` es el nombre que entiende mpv. */
export const HWDECS = [
  { valor: 'auto-safe', nombre: 'Tarjeta gráfica: rápido (recomendado)' },
  { valor: 'auto-copy', nombre: 'Tarjeta gráfica: compatible (algo más lento)' },
  { valor: 'no', nombre: 'Procesador (sin tarjeta gráfica)' },
] as const;

export const LIMITES_REPRODUCCION = {
  redimension: [0, 2],
  hwdec: [0, 2],
  siguienteAuto: [0, 1],
  recordarServidor: [0, 1],
} as const;

export function redimensionDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 0, ...LIMITES_REPRODUCCION.redimension);
}

export function hwdecDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 0, ...LIMITES_REPRODUCCION.hwdec);
}

/** `siguiente_auto`: ausente o inválido = sí (el comportamiento de siempre); solo `0` lo desactiva. */
export function siguienteAutoDe(valor: string | null | undefined): boolean {
  return numeroDeAjuste(valor, 1, ...LIMITES_REPRODUCCION.siguienteAuto) === 1;
}

/** `recordar_servidor`: ausente o inválido = no; solo `1` lo activa. */
export function recordarServidorDe(valor: string | null | undefined): boolean {
  return numeroDeAjuste(valor, 0, ...LIMITES_REPRODUCCION.recordarServidor) === 1;
}

/** El servidor a probar primero: el último guardado, y solo si el ajuste está activo y el texto no está vacío. */
export function servidorPreferido(recordar: boolean, ultimo: string | null | undefined): string | undefined {
  if (!recordar) return undefined;
  const t = ultimo?.trim();
  return t ? t : undefined;
}

/** Lo mismo que acepta Rust para `servidor_ultimo`: un nombre corto sin símbolos raros. */
export function servidorGuardable(nombre: string | undefined): nombre is string {
  return nombre !== undefined && /^[A-Za-z0-9 _.-]{1,32}$/.test(nombre);
}
