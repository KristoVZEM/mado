import type { LocalSync } from '../../../core/src/index.ts';
import type { SerieRef } from './datos.ts';

const COMPLETADO = 3;

/**
 * Una serie de tu lista pasa a Completado cuando la racha continua de episodios vistos (desde el 1) llega al
 * total conocido de la obra. Sin estado (no está en tu lista) o sin total (películas, datos que faltan) no se
 * toca: no se añaden entradas nuevas a tu lista ni se adivina el final.
 */
export function debeCompletar(local: Pick<LocalSync, 'estado' | 'progreso' | 'episodios'> | undefined): boolean {
  if (!local || local.estado === null || local.estado === COMPLETADO) return false;
  return local.episodios !== null && local.episodios > 0 && local.progreso >= local.episodios;
}

export interface DepsCompletar {
  /** Estado, racha y total de la serie; `undefined` si no tiene vínculo firme. */
  local(aid: number): Promise<Pick<LocalSync, 'estado' | 'progreso' | 'episodios'> | undefined>;
  fijarEstado(serie: SerieRef, estado: number): Promise<void>;
}

/** Completa la serie si acaba de verse entera. Devuelve si cambió el estado. Nunca lanza. */
export async function completarSiTermino(serie: SerieRef, deps: DepsCompletar): Promise<boolean> {
  try {
    if (!debeCompletar(await deps.local(serie.aid))) return false;
    await deps.fijarEstado(serie, COMPLETADO);
    return true;
  } catch (e) {
    console.error('completar:', e instanceof Error ? e.name : e);
    return false;
  }
}
