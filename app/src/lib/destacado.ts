import type { MediaAnilist } from '../../../core/src/index.ts';
import { hayNuevo, ultimoEmitido } from './anilist.ts';
import type { EntradaBiblioteca, EntradaContinuar, ResumenSerie } from './datos.ts';

export interface Destacado {
  aid: number;
  anilistId: number;
  slug: string;
  titulo: string;
  banner: string;
  /** Episodio que se retoma; `null` si viene de "Siguiendo" y no hay uno pendiente. */
  numero: number | null;
}

/** Una serie de la cabecera con sus datos de AniList (géneros, año, sinopsis…); `media` es `null` si no se leyeron. */
export interface ItemDestacado {
  destacado: Destacado;
  media: MediaAnilist | null;
}

/** Cuántas series rota la cabecera de Inicio. */
export const MAX_DESTACADOS = 6;

/**
 * Las series de la cabecera de Inicio, en orden: primero las de "Continuar viendo" (la más reciente delante) y
 * después las de "Siguiendo", sin repetir y solo las que tengan banner de AniList. Como mucho `max`.
 */
export function elegirDestacados(
  continuar: readonly EntradaContinuar[],
  viendo: readonly EntradaBiblioteca[],
  resumenes: readonly ResumenSerie[],
  max = MAX_DESTACADOS,
): Destacado[] {
  const porAid = new Map(resumenes.filter((r) => r.banner).map((r) => [r.aid, r]));
  const vistos = new Set<number>();
  const salida: Destacado[] = [];
  const anadir = (aid: number, slug: string, titulo: string, numero: number | null) => {
    const r = porAid.get(aid);
    if (!r || vistos.has(aid) || salida.length >= max) return;
    vistos.add(aid);
    salida.push({ aid, anilistId: r.anilistId, slug, titulo, banner: r.banner as string, numero });
  };
  for (const c of continuar) anadir(c.aid, c.slug, c.titulo, c.numero);
  for (const v of viendo) anadir(v.aid, v.slug, v.titulo, null);
  return salida;
}

/** La primera serie de la cabecera, o `null` si no hay ninguna. */
export function elegirDestacado(
  continuar: readonly EntradaContinuar[],
  viendo: readonly EntradaBiblioteca[],
  resumenes: readonly ResumenSerie[],
): Destacado | null {
  return elegirDestacados(continuar, viendo, resumenes, 1)[0] ?? null;
}

/** Último episodio emitido si ya salió alguno que no has visto; si no, `null`. */
export function nuevoDe(resumen: ResumenSerie | undefined, ultimoVisto: number | null): number | null {
  if (!resumen) return null;
  const emitido = ultimoEmitido(resumen);
  return hayNuevo(emitido, ultimoVisto) ? emitido : null;
}

/**
 * Series de la lista (las que sigues o tienes pendientes) que se están emitiendo con un episodio emitido que aún
 * no has visto, en el orden de la lista.
 * Una serie ya terminada con episodios sin ver no cuenta: no es «nuevo».
 */
export function conNuevoEpisodio(
  lista: readonly EntradaBiblioteca[],
  resumenes: ReadonlyMap<number, ResumenSerie>,
): EntradaBiblioteca[] {
  return lista.filter((v) => {
    const r = resumenes.get(v.aid);
    return r?.estado === 'RELEASING' && nuevoDe(r, v.ultimoEpisodio) !== null;
  });
}

/** Texto de la pastilla de una tarjeta: «Nuevo · Ep. 7 emitido»; `undefined` si no hay episodio nuevo. */
export function etiquetaNuevo(resumen: ResumenSerie | undefined, ultimoVisto: number | null): string | undefined {
  const n = nuevoDe(resumen, ultimoVisto);
  return n === null ? undefined : `Nuevo · Ep. ${n} emitido`;
}
