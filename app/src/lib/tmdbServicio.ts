import { NoAutorizado, type MediaAnilist } from '../../../core/src/index.ts';
import { tmdbGuardar, tmdbLeer, type FilaTmdb } from './datos.ts';
import { debeConsultar } from './tmdb.ts';
import { clienteTmdb, hayClaveTmdb } from './tmdbCliente.ts';

const enCurso = new Map<number, Promise<FilaTmdb | null>>();

/**
 * Fondo y logo de TMDB para una obra: lo guardado si sigue vigente; si no, se busca y se guarda (también el
 * «no encontrada»). Todo es opcional: sin clave, sin red o con la clave rechazada se devuelve lo que hubiera
 * guardado, o `null`, y la Ficha se ve igual con lo de AniList.
 */
export function imagenesTmdb(media: MediaAnilist): Promise<FilaTmdb | null> {
  const previa = enCurso.get(media.anilistId);
  if (previa) return previa;
  const p = cargar(media).finally(() => enCurso.delete(media.anilistId));
  enCurso.set(media.anilistId, p);
  return p;
}

async function cargar(media: MediaAnilist): Promise<FilaTmdb | null> {
  let guardada: FilaTmdb | null = null;
  try {
    guardada = await tmdbLeer(media.anilistId);
    if (!debeConsultar(guardada, Date.now()) || !(await hayClaveTmdb())) return guardada; // sin clave no se anota nada
    const r = await clienteTmdb.buscarImagenes(media);
    const fila: FilaTmdb = {
      anilistId: media.anilistId,
      tmdbId: r?.tmdbId ?? null,
      tipo: r?.tipo ?? null,
      fondo: r?.fondo ?? null,
      logo: r?.logo ?? null,
      consultadoEn: Date.now(),
    };
    await tmdbGuardar(fila);
    return fila;
  } catch (e) {
    // NoAutorizado y fallos de red no se anotan: se reintenta en la próxima Ficha.
    if (!(e instanceof NoAutorizado)) console.error(e);
    return guardada;
  }
}
