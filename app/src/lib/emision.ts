import type { EntradaEmision } from './datos.ts';

const NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const TRES_HORAS_MS = 3 * 60 * 60 * 1000;

/** Lunes a las 00:00 (hora local) de la semana de `ahoraMs`, en segundos desde 1970. */
export function inicioDeSemana(ahoraMs: number): number {
  const hoy = new Date(ahoraMs);
  const desdeLunes = (hoy.getDay() + 6) % 7; // lunes = 0 … domingo = 6
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - desdeLunes).getTime() / 1000;
}

export interface DiaAgenda {
  etiqueta: string;
  desdeS: number;
  hastaS: number;
}

/** Los 7 días de la semana (lunes a domingo) con sus límites en segundos; seguro frente a cambios de hora. */
export function diasDeSemana(inicioS: number): DiaAgenda[] {
  const lunes = new Date(inicioS * 1000);
  return Array.from({ length: 7 }, (_, i) => {
    const dia = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
    const siguiente = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i + 1);
    return {
      etiqueta: `${NOMBRES_DIA[dia.getDay()]} ${dia.getDate()}`,
      desdeS: dia.getTime() / 1000,
      hastaS: siguiente.getTime() / 1000,
    };
  });
}

/** Siete listas (una por día, de lunes a domingo) ordenadas por hora; lo que cae fuera de la semana se descarta. */
export function agruparAgenda(entradas: readonly EntradaEmision[], inicioS: number): EntradaEmision[][] {
  const dias = diasDeSemana(inicioS);
  const grupos: EntradaEmision[][] = dias.map(() => []);
  for (const e of entradas) {
    const i = dias.findIndex((d) => e.emiteEn >= d.desdeS && e.emiteEn < d.hastaS);
    if (i >= 0) grupos[i]!.push(e);
  }
  for (const g of grupos) g.sort((a, b) => a.emiteEn - b.emiteEn || a.anilistId - b.anilistId);
  return grupos;
}

/** Con `soloSigues`, deja solo las series que tienes en estado Viendo. */
export function filtrarSigues(entradas: readonly EntradaEmision[], soloSigues: boolean): EntradaEmision[] {
  return soloSigues ? entradas.filter((e) => e.estado === 1) : [...entradas];
}

/** Hora local de emisión en 24 horas: `09:05`. */
export function horaLocal(emiteEnS: number): string {
  const d = new Date(emiteEnS * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** La agenda se vuelve a pedir si nunca se cargó o la última carga tiene más de 3 horas. */
export function debeRefrescarAgenda(ultimaCargaMs: number | null, ahoraMs: number): boolean {
  return ultimaCargaMs === null || ahoraMs - ultimaCargaMs > TRES_HORAS_MS;
}

/** Máximo de títulos distintos que se prueban al buscar una emisión en animeav1 (cada uno es una petición). */
const MAX_TITULOS_BUSQUEDA = 4;

/**
 * Textos con los que buscar la serie en animeav1: romaji, inglés y alias, sin repetir y solo los que
 * llevan letras latinas (animeav1 no entiende los alias en japonés). Los alias incluyen a veces el nombre
 * de la obra principal (p. ej. el mini anime de una serie), lo que permite llegar a ella.
 */
export function titulosParaBuscar(e: Pick<EntradaEmision, 'tituloRomaji' | 'tituloIngles' | 'sinonimos'>): string[] {
  const vistos = new Set<string>();
  for (const t of [e.tituloRomaji, e.tituloIngles, ...e.sinonimos]) {
    const limpio = t?.trim();
    if (limpio && /[a-z]/i.test(limpio)) vistos.add(limpio);
  }
  return [...vistos].slice(0, MAX_TITULOS_BUSQUEDA);
}
