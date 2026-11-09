import { planearRepaso } from '../../../core/src/index.ts';
import type { Rebaja } from '../../../core/src/index.ts';
import type { SerieRef, VinculoAuto } from './datos.ts';

/** Sube cuando cambian las reglas del emparejador: obliga a repasar de nuevo los vínculos automáticos. */
export const VERSION_REPASO = 1;

export interface DepsRepaso {
  vinculos(): Promise<VinculoAuto[]>;
  /** Guarda la confianza nueva del vínculo (sigue siendo `auto`, pero ya dudoso). */
  rebajar(serie: SerieRef, anilistId: number, confianza: number): Promise<void>;
  version(): Promise<number>;
  guardarVersion(n: number): Promise<void>;
}

/**
 * Repasa una vez (por versión de reglas) los vínculos automáticos: los que con las reglas de hoy ya no
 * son firmes pasan a dudosos, así dejan de sincronizarse y la Ficha vuelve a preguntar. No toca los
 * vínculos manuales. Devuelve las rebajas, o `null` si ya estaba repasado. Si alguna rebaja falla no
 * anota la versión y se reintenta al abrir.
 */
export async function repasarSiHaceFalta(deps: DepsRepaso): Promise<Rebaja[] | null> {
  if ((await deps.version()) >= VERSION_REPASO) return null;
  const vinculos = await deps.vinculos();
  const porAid = new Map(vinculos.map((v) => [v.aid, v]));
  const rebajas = planearRepaso(vinculos.map((v) => ({ aid: v.aid, titulo: v.titulo, confianza: v.confianza, media: v.media })));
  let fallos = 0;
  for (const r of rebajas) {
    const v = porAid.get(r.aid)!;
    try {
      await deps.rebajar({ aid: v.aid, slug: v.slug, titulo: v.titulo }, r.anilistId, r.despues);
    } catch (e) {
      fallos++;
      console.error('repaso de vínculos:', e instanceof Error ? e.name : e);
    }
  }
  if (fallos === 0) await deps.guardarVersion(VERSION_REPASO);
  return rebajas;
}
