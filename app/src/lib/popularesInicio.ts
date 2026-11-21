import { confianza, popularesEnEmision, UMBRAL_AUTO, type MediaAnilist } from '../../../core/src/index.ts';
import { clienteAnilist } from './anilistCliente.ts';
import { leerAjuste, guardarAjuste } from './datos.ts';
import type { ItemDestacado } from './destacado.ts';
import { titulosParaBuscar } from './emision.ts';
import { fuentesFondo } from './fuentes.ts';

const CLAVE = 'inicio_populares';
/** La lista se rehace cada 6 h: la popularidad apenas cambia y cada serie cuesta unas búsquedas en la fuente. */
const VIGENCIA_MS = 6 * 3_600_000;
/** Cuántas series entran en el carrusel y cuántas obras se piden a AniList para llegar a ese número. */
const CUANTAS = 6;
const CANDIDATAS = 14;

interface Guardado {
  en: number;
  items: ItemDestacado[];
}

/** Busca la obra en animeav1 y devuelve la mejor coincidencia firme, o `null`. */
async function buscarEnFuente(m: MediaAnilist): Promise<ItemDestacado | null> {
  const candidato = {
    anilistId: m.anilistId,
    tituloRomaji: m.tituloRomaji,
    tituloIngles: m.tituloIngles,
    tituloNativo: m.tituloNativo,
    sinonimos: m.sinonimos,
    anio: m.anio,
    episodios: m.episodios,
  };
  let mejor: { aid: number; slug: string; title: string; c: number } | null = null;
  for (const t of titulosParaBuscar(m)) {
    for (const res of await fuentesFondo.buscar(t)) {
      const c = confianza({ titulo: res.title }, candidato);
      if (!mejor || c > mejor.c) mejor = { aid: res.aid, slug: res.slug, title: res.title, c };
    }
    if (mejor && mejor.c >= 0.99) break;
  }
  if (!mejor || mejor.c < UMBRAL_AUTO) return null;
  return {
    destacado: {
      aid: mejor.aid,
      anilistId: m.anilistId,
      slug: mejor.slug,
      titulo: mejor.title,
      banner: m.banner ?? m.portada ?? '',
      numero: null,
    },
    media: m,
  };
}

/**
 * Las series que se emiten ahora, de más a menos populares, ya localizadas en animeav1 (las que la fuente no
 * tiene se saltan). Se guarda el resultado unas horas. Lanza si AniList falla y no hay nada guardado.
 */
export async function popularesDeInicio(ahoraMs = Date.now()): Promise<ItemDestacado[]> {
  let guardado: Guardado | null = null;
  try {
    const crudo = await leerAjuste(CLAVE);
    if (crudo) guardado = JSON.parse(crudo) as Guardado;
  } catch {
    guardado = null;
  }
  if (guardado && ahoraMs - guardado.en < VIGENCIA_MS && guardado.items.length > 0) return guardado.items;

  try {
    const medias = await popularesEnEmision(clienteAnilist, CANDIDATAS);
    // Las búsquedas van en paralelo (de 4 en 4) y el orden de popularidad se conserva.
    const validas = medias.filter((m) => m.banner || m.portada);
    const items: ItemDestacado[] = [];
    for (let i = 0; i < validas.length && items.length < CUANTAS; i += 4) {
      const lote = await Promise.all(validas.slice(i, i + 4).map((m) => buscarEnFuente(m).catch(() => null)));
      for (const it of lote) if (it && items.length < CUANTAS) items.push(it);
    }
    if (items.length > 0) await guardarAjuste(CLAVE, JSON.stringify({ en: ahoraMs, items })).catch(() => {});
    return items;
  } catch (e) {
    if (guardado && guardado.items.length > 0) return guardado.items; // red caída: vale la lista vieja
    throw e;
  }
}
