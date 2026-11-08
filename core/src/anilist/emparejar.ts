import { normalizar, parecido } from './titulos.ts';

export interface CandidatoAnilist {
  anilistId: number;
  tituloRomaji: string;
  tituloIngles: string | null;
  tituloNativo: string | null;
  sinonimos: string[];
  anio: number | null;
  episodios: number | null;
}

export interface SerieABuscar {
  titulo: string;
  anio?: number | null;
  episodios?: number | null;
}

export const UMBRAL_AUTO = 0.85;
export const UMBRAL_MINIMO = 0.6;

/** Mejor parecido entre el título buscado y cualquiera de los nombres del candidato. */
export function mejorParecido(titulo: string, c: CandidatoAnilist): number {
  const t = normalizar(titulo);
  const nombres = [c.tituloRomaji, c.tituloIngles, ...c.sinonimos].filter((x): x is string => !!x);
  return nombres.reduce((m, n) => Math.max(m, parecido(t, normalizar(n))), 0);
}

/** Confianza de 0 a 1: parecido del título, ajustado por año y número de episodios cuando se conocen. */
export function confianza(s: SerieABuscar, c: CandidatoAnilist): number {
  let v = mejorParecido(s.titulo, c);
  if (s.anio != null && c.anio != null) {
    const d = Math.abs(s.anio - c.anio);
    if (d === 0) v += 0.08;
    else if (d >= 2) v -= 0.25;
  }
  if (s.episodios != null && c.episodios != null && s.episodios > 0 && c.episodios > 0) {
    if (s.episodios === c.episodios) v += 0.05;
    else if (Math.abs(s.episodios - c.episodios) / Math.max(s.episodios, c.episodios) > 0.5) v -= 0.1;
  }
  return Math.min(1, Math.max(0, v));
}

export interface Propuesta {
  candidato: CandidatoAnilist;
  confianza: number;
}

/** Candidatos de mayor a menor confianza (empate: id más bajo, para que sea estable). */
export function ordenar(s: SerieABuscar, candidatos: readonly CandidatoAnilist[]): Propuesta[] {
  return candidatos
    .map((candidato) => ({ candidato, confianza: confianza(s, candidato) }))
    .sort((a, b) => b.confianza - a.confianza || a.candidato.anilistId - b.candidato.anilistId);
}

export type Decision =
  | { tipo: 'auto'; propuesta: Propuesta }
  | { tipo: 'dudoso'; propuesta: Propuesta; otras: Propuesta[] }
  | { tipo: 'ninguno'; otras: Propuesta[] };

/** Aplica los umbrales: ≥ 0,85 vínculo automático; entre 0,6 y 0,85 dudoso; menos, ninguno. */
export function decidir(s: SerieABuscar, candidatos: readonly CandidatoAnilist[]): Decision {
  const orden = ordenar(s, candidatos);
  const mejor = orden[0];
  if (!mejor || mejor.confianza < UMBRAL_MINIMO) return { tipo: 'ninguno', otras: orden };
  if (mejor.confianza >= UMBRAL_AUTO) return { tipo: 'auto', propuesta: mejor };
  return { tipo: 'dudoso', propuesta: mejor, otras: orden.slice(1) };
}
