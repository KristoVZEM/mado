import type { Idioma } from '../../../core/src/index.ts';

/** `mm:ss` (o `h:mm:ss` desde la hora). Valores no finitos o negativos cuentan como 0. */
export function formatoTiempo(segundos: number): string {
  const s = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Texto de la tarjeta de "Continuar viendo": `Ep. 3 · 4:05 / 23:40` (sin total si la duración es 0). */
export function textoTarjeta(numero: number, posicionS: number, duracionS: number): string {
  const tiempo =
    Number.isFinite(duracionS) && duracionS > 0
      ? `${formatoTiempo(posicionS)} / ${formatoTiempo(duracionS)}`
      : formatoTiempo(posicionS);
  return `Ep. ${numero} · ${tiempo}`;
}

/** Fracción vista entre 0 y 1; `null` si no hay duración (sin franja). */
export function fraccionVista(posicionS: number, duracionS: number): number | null {
  if (!Number.isFinite(duracionS) || duracionS <= 0 || !Number.isFinite(posicionS)) return null;
  return Math.min(1, Math.max(0, posicionS / duracionS));
}

/** Idioma guardado de una serie (`idioma:<aid>`): el guardado si es exactamente SUB o DUB; si no, `defecto`. */
export function idiomaGuardado(valor: string | null | undefined, defecto: Idioma = 'SUB'): Idioma {
  const v = valor?.trim();
  return v === 'DUB' ? 'DUB' : v === 'SUB' ? 'SUB' : defecto;
}

/** Entero dentro de `[min, max]` escrito en un campo; `null` si no vale. */
export function validarSalto(texto: string, min: number, max: number): number | null {
  const t = texto.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Texto de la tarjeta de Inicio: `Ep. 3 · quedan 19:35` (solo `Ep. 3` si no se conoce la duración). */
export function textoRestante(numero: number, posicionS: number, duracionS: number): string {
  if (!Number.isFinite(duracionS) || duracionS <= 0) return `Ep. ${numero}`;
  const pos = Number.isFinite(posicionS) && posicionS > 0 ? posicionS : 0;
  return `Ep. ${numero} · quedan ${formatoTiempo(Math.max(0, duracionS - pos))}`;
}
