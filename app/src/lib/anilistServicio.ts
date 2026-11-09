import { aCandidato, buscarCandidatos, decidir, type MediaAnilist } from '../../../core/src/index.ts';
import { clienteAnilist } from './anilistCliente.ts';
import { esDudoso, necesitaRefresco } from './anilist.ts';
import { fijarVinculo, guardarMedia, vinculoConMedia, type SerieRef, type VinculoConMedia } from './datos.ts';

export interface EstadoVinculo {
  actual: VinculoConMedia | null;
  /** Otros candidatos para la pregunta «¿Es esta serie?» (vacío si el vínculo es firme). */
  candidatos: MediaAnilist[];
}

const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Devuelve el vínculo de la serie, buscándolo si no existe o no es firme. `extra` aporta año y número
 * de episodios (la Ficha los conoce; la pasada en segundo plano no). Nunca lanza: los fallos de red
 * dejan el estado como estaba.
 */
export async function asegurarVinculo(
  serie: SerieRef,
  extra: { anio?: number | null; episodios?: number | null } = {},
): Promise<EstadoVinculo> {
  let actual: VinculoConMedia | null = null;
  try {
    actual = await vinculoConMedia(serie.aid);
  } catch (e) {
    console.error(e);
    return { actual: null, candidatos: [] };
  }
  const v = actual?.vinculo;
  const firme = v && (v.origen === 'manual' || (v.origen === 'auto' && !esDudoso(v)));
  const ningunoReciente = v?.origen === 'ninguno' && Date.now() - v.actualizado < TREINTA_DIAS_MS;
  const sinNovedad = firme || (ningunoReciente && extra.anio == null);
  if (sinNovedad) return { actual, candidatos: [] };

  try {
    const [candidatos] = await buscarCandidatos(clienteAnilist, [serie.titulo]);
    const lista = candidatos ?? [];
    const decision = decidir({ titulo: serie.titulo, ...extra }, lista.map(aCandidato));
    const por = new Map(lista.map((m) => [m.anilistId, m]));
    if (decision.tipo === 'ninguno') {
      await fijarVinculo(serie, null, decision.otras[0]?.confianza ?? 0, 'ninguno');
    } else {
      const media = por.get(decision.propuesta.candidato.anilistId)!;
      await guardarMedia(media);
      await fijarVinculo(serie, media.anilistId, decision.propuesta.confianza, 'auto');
    }
    const nuevo = await vinculoConMedia(serie.aid);
    const otras = decision.tipo === 'auto' ? [] : decision.otras;
    return {
      actual: nuevo,
      candidatos: decision.tipo === 'auto' ? [] : otras.map((p) => por.get(p.candidato.anilistId)!).filter(Boolean),
    };
  } catch (e) {
    console.error(e);
    return { actual, candidatos: [] };
  }
}

/** El usuario elige a mano la obra de una serie: vínculo `manual` con confianza 1. */
export async function elegirVinculo(serie: SerieRef, media: MediaAnilist): Promise<void> {
  await guardarMedia(media);
  await fijarVinculo(serie, media.anilistId, 1, 'manual');
}

/** Vuelve a pedir la obra si hace falta (más de 24 h o episodio ya emitido) y la guarda. No lanza. */
export async function refrescarSiHaceFalta(actual: VinculoConMedia | null, titulo: string): Promise<VinculoConMedia | null> {
  const m = actual?.media;
  if (!actual || !m || !necesitaRefresco(m, Date.now())) return actual;
  try {
    const [candidatos] = await buscarCandidatos(clienteAnilist, [m.tituloRomaji || titulo]);
    const fresca = (candidatos ?? []).find((c) => c.anilistId === m.anilistId);
    if (!fresca) return actual;
    await guardarMedia(fresca);
    return await vinculoConMedia(actual.vinculo.aid);
  } catch (e) {
    console.error(e);
    return actual;
  }
}
