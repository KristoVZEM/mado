import { numeroDeAjuste } from './ajustes.ts';

/** `auto_respaldo`: cada cuánto se guarda una copia de la base. El valor guardado es la posición en esta lista. */
export const AUTO_RESPALDOS = [
  { dias: 0, nombre: 'Nunca' },
  { dias: 1, nombre: 'Cada día' },
  { dias: 7, nombre: 'Cada 7 días' },
  { dias: 30, nombre: 'Cada 30 días' },
] as const;

/** `espera_conexion`: cuántos segundos se espera la respuesta de la fuente antes de darla por caída. */
export const ESPERAS_CONEXION = [
  { segundos: 10, nombre: '10 segundos' },
  { segundos: 15, nombre: '15 segundos (por defecto)' },
  { segundos: 30, nombre: '30 segundos' },
  { segundos: 60, nombre: '1 minuto' },
] as const;

export const LIMITES_DATOS = {
  autoRespaldo: [0, AUTO_RESPALDOS.length - 1],
  espera: [0, ESPERAS_CONEXION.length - 1],
} as const;

const DIA_MS = 86_400_000;

export function autoRespaldoDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 0, ...LIMITES_DATOS.autoRespaldo);
}

/** Posición de la espera guardada; ausente o inválida = 15 segundos, como hasta ahora. */
export function esperaDe(valor: string | null | undefined): number {
  return numeroDeAjuste(valor, 1, ...LIMITES_DATOS.espera);
}

export function esperaMs(posicion: number): number {
  return (ESPERAS_CONEXION[posicion] ?? ESPERAS_CONEXION[1]).segundos * 1000;
}

/**
 * ¿Toca hacer un respaldo? Con «Nunca», no. Sin respaldo previo (`ultimoMs` 0), sí. Si el reloj retrocedió
 * (`ultimoMs` en el futuro) tampoco: no se llena el disco por un cambio de hora.
 */
export function respaldoDebido(posicion: number, ultimoMs: number, ahoraMs: number): boolean {
  const dias = (AUTO_RESPALDOS[posicion] ?? AUTO_RESPALDOS[0]).dias;
  if (dias === 0) return false;
  if (!Number.isFinite(ultimoMs) || ultimoMs <= 0) return true;
  if (ultimoMs > ahoraMs) return false;
  return ahoraMs - ultimoMs >= dias * DIA_MS;
}

/** `AAAA-MM-DD` del día local de `ms`: el nombre del respaldo. */
export function etiquetaDia(ms: number): string {
  const f = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
}

/** Nombre sugerido al exportar a mano. */
export function nombreCopia(ms: number): string {
  return `ukiku-${etiquetaDia(ms)}.db`;
}
