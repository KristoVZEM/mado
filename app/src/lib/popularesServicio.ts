import { confianza, UMBRAL_AUTO, type MediaAnilist, type ResultadoBusqueda } from '../../../core/src/index.ts';
import type { ItemDestacado } from './destacado.ts';
import { titulosParaBuscar } from './emision.ts';

/** La lista se rehace cada 6 h: la popularidad apenas cambia de un día para otro. */
export const VIGENCIA_MS = 6 * 3_600_000;
/** Cuánto se recuerda en qué serie de la fuente está una obra de AniList: así no se busca otra vez cada 6 h. */
export const RECUERDO_ENCONTRADA_MS = 30 * 86_400_000;
/** Las que la fuente no tiene se vuelven a buscar antes, por si las añade. */
export const RECUERDO_NINGUNA_MS = 3 * 86_400_000;
/** Cuántas series entran en el carrusel y cuántas obras se piden a AniList para llegar a ese número. */
export const CUANTAS = 6;
export const CANDIDATAS = 14;

/** En qué serie de la fuente está una obra de AniList (`aid: null` = la fuente no la tiene). */
export type Recordada = { aid: number; slug: string; titulo: string; en: number } | { aid: null; en: number };

export interface GuardadoPopulares {
  en: number;
  items: ItemDestacado[];
  /** Por `anilistId`. Las listas guardadas antes de existir esto no lo traen. */
  recordadas?: Record<string, Recordada>;
}

export interface DepsPopulares {
  leer(): Promise<string | null>;
  guardar(datos: string): Promise<void>;
  /** Las obras en emisión de AniList, de más a menos populares. */
  populares(n: number): Promise<MediaAnilist[]>;
  /** Búsqueda en la fuente, con prioridad baja. */
  buscar(titulo: string): Promise<ResultadoBusqueda[]>;
}

/** Lee la lista guardada; una rota o con otra forma cuenta como que no hay. */
export function leerGuardado(crudo: string | null): GuardadoPopulares | null {
  if (!crudo) return null;
  try {
    const g = JSON.parse(crudo) as Partial<GuardadoPopulares>;
    if (typeof g?.en !== 'number' || !Array.isArray(g.items)) return null;
    const recordadas = g.recordadas && typeof g.recordadas === 'object' && !Array.isArray(g.recordadas) ? g.recordadas : {};
    return { en: g.en, items: g.items, recordadas };
  } catch {
    return null;
  }
}

/** Lo recordado que sigue vigente y tiene la forma esperada; el resto se olvida. */
export function recordadasVigentes(recordadas: Record<string, unknown> | undefined, ahoraMs: number): Record<string, Recordada> {
  const fuera: Record<string, Recordada> = {};
  for (const [id, r] of Object.entries(recordadas ?? {})) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (typeof x.en !== 'number') continue;
    const edad = ahoraMs - x.en;
    if (x.aid === null) {
      if (edad < RECUERDO_NINGUNA_MS) fuera[id] = { aid: null, en: x.en };
    } else if (typeof x.aid === 'number' && typeof x.slug === 'string' && typeof x.titulo === 'string') {
      if (edad < RECUERDO_ENCONTRADA_MS) fuera[id] = { aid: x.aid, slug: x.slug, titulo: x.titulo, en: x.en };
    }
  }
  return fuera;
}

/** Busca la obra en la fuente por sus títulos y devuelve la mejor coincidencia firme, o `null` si no la tiene. Lanza si falla la red. */
async function buscarEnFuente(deps: DepsPopulares, m: MediaAnilist): Promise<{ aid: number; slug: string; titulo: string } | null> {
  const candidato = {
    anilistId: m.anilistId,
    tituloRomaji: m.tituloRomaji,
    tituloIngles: m.tituloIngles,
    tituloNativo: m.tituloNativo,
    sinonimos: m.sinonimos,
    anio: m.anio,
    episodios: m.episodios,
  };
  let mejor: { aid: number; slug: string; titulo: string; c: number } | null = null;
  for (const t of titulosParaBuscar(m)) {
    for (const res of await deps.buscar(t)) {
      const c = confianza({ titulo: res.title }, candidato);
      if (!mejor || c > mejor.c) mejor = { aid: res.aid, slug: res.slug, titulo: res.title, c };
    }
    if (mejor && mejor.c >= 0.99) break;
  }
  if (!mejor || mejor.c < UMBRAL_AUTO) return null;
  return { aid: mejor.aid, slug: mejor.slug, titulo: mejor.titulo };
}

/**
 * Rehace la lista: pide las populares a AniList y localiza cada una en la fuente, de una en una y en orden de
 * popularidad hasta tener `CUANTAS`. Lo ya recordado no se busca otra vez. Si hubo series, guarda la lista y lo
 * recordado. Lanza si AniList falla.
 */
export async function rehacerPopulares(deps: DepsPopulares, previo: GuardadoPopulares | null, ahoraMs: number): Promise<ItemDestacado[]> {
  const medias = await deps.populares(CANDIDATAS);
  const recordadas = recordadasVigentes(previo?.recordadas, ahoraMs);
  const items: ItemDestacado[] = [];
  for (const m of medias) {
    if (items.length >= CUANTAS) break;
    if (!m.banner && !m.portada) continue;
    const clave = String(m.anilistId);
    let r: Recordada | undefined = recordadas[clave];
    if (!r) {
      try {
        const hallada = await buscarEnFuente(deps, m);
        r = hallada ? { ...hallada, en: ahoraMs } : { aid: null, en: ahoraMs };
        recordadas[clave] = r;
      } catch (e) {
        // Un fallo de red no dice que la fuente no la tenga: no se recuerda y se prueba la siguiente vez.
        console.error('populares: falló la búsqueda', e instanceof Error ? e.name : e);
        continue;
      }
    }
    if (r.aid === null) continue;
    items.push({
      destacado: { aid: r.aid, anilistId: m.anilistId, slug: r.slug, titulo: r.titulo, banner: m.banner ?? m.portada ?? '', numero: null },
      media: m,
    });
  }
  if (items.length > 0) {
    const nuevo: GuardadoPopulares = { en: ahoraMs, items, recordadas };
    await deps.guardar(JSON.stringify(nuevo)).catch((e) => console.error('populares: no se pudo guardar', e instanceof Error ? e.name : e));
  }
  return items;
}

export interface OpcionesPopulares {
  ahoraMs?: number;
  /** Si se enseñó una lista vencida, recibe la nueva cuando se termina de rehacer en segundo plano. */
  alRenovar?: (items: ItemDestacado[]) => void;
}

/**
 * Lo que pide la cabecera de Inicio, sin hacer esperar: la lista guardada si hay, aunque esté vencida (entonces se
 * rehace en segundo plano y llega por `alRenovar`). Solo la primera vez, sin nada guardado, espera a rehacerla.
 * Lanza si no hay nada guardado y AniList falla.
 */
export function crearPopulares(deps: DepsPopulares) {
  // Una sola reconstrucción a la vez: si Inicio vuelve a pedir mientras tanto, se engancha a la misma.
  let enCurso: Promise<ItemDestacado[]> | null = null;
  const rehacer = (previo: GuardadoPopulares | null, ahoraMs: number) => {
    enCurso ??= rehacerPopulares(deps, previo, ahoraMs).finally(() => (enCurso = null));
    return enCurso;
  };

  return async function popularesDeInicio(op: OpcionesPopulares = {}): Promise<ItemDestacado[]> {
    const ahoraMs = op.ahoraMs ?? Date.now();
    let previo: GuardadoPopulares | null = null;
    try {
      previo = leerGuardado(await deps.leer());
    } catch {
      previo = null;
    }
    if (!previo || previo.items.length === 0) return rehacer(previo, ahoraMs);
    if (ahoraMs - previo.en >= VIGENCIA_MS) {
      rehacer(previo, ahoraMs)
        .then((items) => {
          if (items.length > 0) op.alRenovar?.(items);
        })
        .catch((e) => console.error('populares: no se pudo renovar la lista', e instanceof Error ? e.name : e));
    }
    return previo.items;
  };
}
