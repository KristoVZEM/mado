import { planearAvisos, textoAviso } from '../../../core/src/index.ts';
import type { SerieVigilada } from '../../../core/src/index.ts';
import type { CandidataAviso } from './datos.ts';

export const INTERVALO_AVISOS_MS = 30 * 60_000;
const PAUSA_ENTRE_SERIES_MS = 1000;

export interface DepsAvisos {
  activo(): Promise<boolean>;
  candidatas(): Promise<CandidataAviso[]>;
  /** Números de episodio que la fuente tiene ahora para la serie; lanza si la fuente falla. */
  disponibles(slug: string): Promise<number[]>;
  guardar(items: { aid: number; ultimo: number }[]): Promise<void>;
  notificar(texto: { titulo: string; cuerpo: string }): Promise<void>;
  pausa(ms: number): Promise<void>;
}

/**
 * Mira las series candidatas y avisa de los episodios nuevos. Notifica primero y anota después: si el aviso
 * falla no se anota nada y se reintenta en el siguiente ciclo. `comprobar` nunca lanza y no se solapa.
 */
export function crearVigilante(deps: DepsAvisos) {
  let enMarcha = false;
  return {
    /** Devuelve cuántas series avisó (0 si algo falló). */
    async comprobar(): Promise<number> {
      if (enMarcha) return 0;
      enMarcha = true;
      try {
        if (!(await deps.activo())) return 0;
        const candidatas = await deps.candidatas();
        const vigiladas: SerieVigilada[] = [];
        for (const [i, c] of candidatas.entries()) {
          if (i > 0) await deps.pausa(PAUSA_ENTRE_SERIES_MS);
          try {
            vigiladas.push({
              aid: c.aid,
              titulo: c.titulo,
              ultimoAvisado: c.ultimoAvisado,
              ultimoVisto: c.ultimoVisto,
              disponibles: await deps.disponibles(c.slug),
            });
          } catch (e) {
            console.error('avisos: no se pudo mirar una serie:', e instanceof Error ? e.name : e);
          }
        }
        const plan = planearAvisos(vigiladas);
        if (plan.avisos.length > 0) await deps.notificar(textoAviso(plan.avisos));
        if (plan.guardar.length > 0) await deps.guardar(plan.guardar);
        return plan.avisos.length;
      } catch (e) {
        console.error('avisos:', e instanceof Error ? e.name : e);
        return 0;
      } finally {
        enMarcha = false;
      }
    },
  };
}
