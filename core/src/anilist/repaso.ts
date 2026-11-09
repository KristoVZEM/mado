// Repaso de los vínculos automáticos ya guardados. Es puro: no usa red ni base.
//
// Un vínculo `auto` se aceptó con confianza >= UMBRAL_AUTO, que incluye hasta +0,13 de bonus por año y
// número de episodios (+0,08 y +0,05). Por eso, si las reglas del título no cambiaron, su parecido de
// título solo es >= UMBRAL_AUTO - 0,13. Si hoy queda por debajo de ese suelo es porque las reglas
// cambiaron (p. ej. la penalización por temporada distinta): ese vínculo ya no es de fiar.

import { aCandidato } from './consultas.ts';
import { mejorParecido, UMBRAL_AUTO } from './emparejar.ts';
import type { MediaAnilist } from './tipos.ts';

/** Bonus máximo que pudo sumar la confianza: año exacto (+0,08) y mismo número de episodios (+0,05). */
const BONUS_MAXIMO = 0.13;

export interface VinculoAutoRepaso {
  aid: number;
  titulo: string;
  /** La confianza guardada del vínculo `auto`. */
  confianza: number;
  media: MediaAnilist;
}

export interface Rebaja {
  aid: number;
  titulo: string;
  anilistId: number;
  obra: string;
  antes: number;
  /** El parecido de título actual: pasa a ser la confianza guardada (queda por debajo de UMBRAL_AUTO). */
  despues: number;
}

/** Vínculos `auto` firmes que, con las reglas de hoy, ya no lo son. Lo que ya era dudoso no se toca. */
export function planearRepaso(vinculos: readonly VinculoAutoRepaso[]): Rebaja[] {
  const rebajas: Rebaja[] = [];
  for (const v of vinculos) {
    if (v.confianza < UMBRAL_AUTO) continue;
    const despues = mejorParecido(v.titulo, aCandidato(v.media));
    if (despues < UMBRAL_AUTO - BONUS_MAXIMO) {
      rebajas.push({
        aid: v.aid,
        titulo: v.titulo,
        anilistId: v.media.anilistId,
        obra: v.media.tituloRomaji,
        antes: v.confianza,
        despues,
      });
    }
  }
  return rebajas;
}
