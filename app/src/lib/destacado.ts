import { hayNuevo, ultimoEmitido } from './anilist.ts';
import type { EntradaBiblioteca, EntradaContinuar, ResumenSerie } from './datos.ts';

export interface Destacado {
  aid: number;
  slug: string;
  titulo: string;
  banner: string;
  /** Episodio que se retoma; `null` si viene de "Siguiendo" y no hay uno pendiente. */
  numero: number | null;
}

/**
 * La serie de la cabecera de Inicio: la más reciente de "Continuar viendo" que tenga banner de AniList
 * o, si ninguna lo tiene, la primera de "Siguiendo" que lo tenga. `null` si no hay ninguna.
 */
export function elegirDestacado(
  continuar: readonly EntradaContinuar[],
  viendo: readonly EntradaBiblioteca[],
  resumenes: readonly ResumenSerie[],
): Destacado | null {
  const banners = new Map(resumenes.filter((r) => r.banner).map((r) => [r.aid, r.banner as string]));
  for (const c of continuar) {
    const banner = banners.get(c.aid);
    if (banner) return { aid: c.aid, slug: c.slug, titulo: c.titulo, banner, numero: c.numero };
  }
  for (const v of viendo) {
    const banner = banners.get(v.aid);
    if (banner) return { aid: v.aid, slug: v.slug, titulo: v.titulo, banner, numero: null };
  }
  return null;
}

/** Último episodio emitido si ya salió alguno que no has visto; si no, `null`. */
export function nuevoDe(resumen: ResumenSerie | undefined, ultimoVisto: number | null): number | null {
  if (!resumen) return null;
  const emitido = ultimoEmitido(resumen);
  return hayNuevo(emitido, ultimoVisto) ? emitido : null;
}

/** Texto de la pastilla de una tarjeta: «Nuevo · Ep. 7 emitido»; `undefined` si no hay episodio nuevo. */
export function etiquetaNuevo(resumen: ResumenSerie | undefined, ultimoVisto: number | null): string | undefined {
  const n = nuevoDe(resumen, ultimoVisto);
  return n === null ? undefined : `Nuevo · Ep. ${n} emitido`;
}
