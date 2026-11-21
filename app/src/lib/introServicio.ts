import type { IntroDe } from '../../../core/src/index.ts';
import type { FilaIntro } from './datos.ts';
import { consultable, duracionClave, type TramoIntro } from './intro.ts';

export interface DepsIntro {
  leer(malId: number, episodio: number, duracionS: number): Promise<FilaIntro | null>;
  guardar(fila: FilaIntro): Promise<void>;
  pedir(p: { malId: number; episodio: number; duracion: number }): Promise<IntroDe>;
}

/**
 * El tramo del opening de un episodio: primero la caché y, si no hay nada vigente, AniSkip. Nunca lanza: cualquier
 * problema (caché rota, red, respuesta rara) se queda en «sin tramo» y la reproducción sigue como siempre.
 */
export async function buscarIntro(
  deps: DepsIntro,
  p: { malId: number | null | undefined; episodio: number; duracion: number },
): Promise<TramoIntro | null> {
  if (!consultable(p.malId, p.episodio, p.duracion)) return null;
  const malId = p.malId as number;
  const duracionS = duracionClave(p.duracion);
  try {
    const guardada = await deps.leer(malId, p.episodio, duracionS);
    if (guardada) {
      return guardada.estado === 'si' && guardada.inicio !== null && guardada.fin !== null
        ? { inicio: guardada.inicio, fin: guardada.fin }
        : null;
    }
  } catch (e) {
    console.error('intro: no se pudo leer la caché', e instanceof Error ? e.name : e);
  }
  let respuesta: IntroDe;
  try {
    respuesta = await deps.pedir({ malId, episodio: p.episodio, duracion: p.duracion });
  } catch (e) {
    console.error('intro: fallo al consultar AniSkip', e instanceof Error ? e.name : e);
    return null;
  }
  if (respuesta.estado === 'error') return null;
  const fila: FilaIntro =
    respuesta.estado === 'si'
      ? { malId, episodio: p.episodio, duracionS, estado: 'si', inicio: respuesta.inicio, fin: respuesta.fin }
      : { malId, episodio: p.episodio, duracionS, estado: 'no', inicio: null, fin: null };
  try {
    await deps.guardar(fila);
  } catch (e) {
    console.error('intro: no se pudo guardar en la caché', e instanceof Error ? e.name : e);
  }
  return respuesta.estado === 'si' ? { inicio: respuesta.inicio, fin: respuesta.fin } : null;
}
