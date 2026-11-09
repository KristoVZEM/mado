import { decodePage } from './devalue.ts';
import { FuenteCambio } from './errors.ts';
import { BASE, leerJson } from './http.ts';
import type { Http } from './http.ts';

export interface ResultadoBusqueda {
  aid: number;
  title: string;
  slug: string;
}

function leerAid(id: unknown): number | null {
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) return id;
  if (typeof id === 'string' && /^[1-9]\d*$/.test(id)) return Number(id);
  return null;
}

export function parseBusqueda(payload: Parameters<typeof decodePage>[0]): ResultadoBusqueda[] {
  const page = decodePage(payload);
  if (!Array.isArray(page.results)) throw new FuenteCambio('búsqueda: la respuesta no trae "results"');
  return page.results.map((r: any, i: number): ResultadoBusqueda => {
    const aid = leerAid(r?.id);
    if (typeof r?.slug !== 'string' || typeof r?.title !== 'string' || aid === null) {
      throw new FuenteCambio(`búsqueda: el resultado ${i} no trae "id", "title" y "slug" válidos`);
    }
    return { aid, title: r.title, slug: r.slug };
  });
}

export type OrdenCatalogo = 'popular' | 'score' | 'title';

export interface OpcionesCatalogo {
  orden?: OrdenCatalogo;
  /** Solo lo que se está emitiendo. */
  estado?: 'emision';
  /** Página 1 por defecto; cada página trae 20 resultados. */
  pagina?: number;
}

/** URL de un listado del catálogo sin búsqueda. Sin opciones: lo añadido más recientemente. */
export function urlCatalogo(o: OpcionesCatalogo = {}): string {
  const params = new URLSearchParams();
  if (o.estado) params.set('status', o.estado);
  if (o.orden) params.set('order', o.orden);
  if (o.pagina !== undefined) {
    if (!Number.isInteger(o.pagina) || o.pagina < 1) throw new RangeError('la página debe ser un entero desde 1');
    if (o.pagina > 1) params.set('page', String(o.pagina));
  }
  const q = params.toString();
  return `${BASE}/catalogo/__data.json${q ? `?${q}` : ''}`;
}

export async function catalogo(http: Http, o: OpcionesCatalogo = {}): Promise<ResultadoBusqueda[]> {
  const res = await http.get(urlCatalogo(o));
  return parseBusqueda(await leerJson(res, 'catálogo'));
}

export async function buscar(http: Http, query: string): Promise<ResultadoBusqueda[]> {
  const res = await http.get(`${BASE}/catalogo/__data.json?search=${encodeURIComponent(query)}`);
  return parseBusqueda(await leerJson(res, 'búsqueda'));
}
