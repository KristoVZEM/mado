import { FuenteCambio, NoAutorizado, SinRed } from '../errors.ts';
import { normalizar, parecido, temporadaDe } from '../anilist/titulos.ts';
import { UMBRAL_AUTO } from '../anilist/emparejar.ts';
import type { ImagenesTmdb, ObraParaTmdb } from './tipos.ts';

export const URL_TMDB = 'https://api.themoviedb.org/3';
export const URL_IMAGENES_TMDB = 'https://image.tmdb.org/t/p';

export interface OpcionesTmdb {
  /** En la app, el `fetch` de plugin-http; en pruebas, uno falso. */
  fetch?: typeof fetch;
  /** Clave de API (v3, 32 caracteres) o token de lectura (v4, empieza por `eyJ`). Nunca se imprime. */
  clave: () => string | null | Promise<string | null>;
}

export interface ClienteTmdb {
  /** Busca la obra por título y devuelve su fondo y su logo; `null` si no hay clave o no se reconoce. */
  buscarImagenes(obra: ObraParaTmdb): Promise<ImagenesTmdb | null>;
  /** Comprueba que la clave sirve; lanza `NoAutorizado` si TMDB la rechaza. */
  probar(): Promise<void>;
}

interface ResultadoBusqueda {
  id: number;
  name?: string;
  original_name?: string;
  title?: string;
  original_title?: string;
  /** Idioma original de la obra (`ja` en un anime). */
  original_language?: string;
  popularity?: number;
}

interface ImagenTmdb {
  file_path: string;
  iso_639_1: string | null;
  width: number;
  vote_average: number;
}

/** El título sin el número de temporada del final: los fondos y logos de TMDB son de la serie entera. */
function sinTemporada(titulo: string): string {
  const n = normalizar(titulo);
  return temporadaDe(n) === null ? n : n.replace(/ \S+$/, '');
}

/** Parecido entre un resultado de TMDB y los nombres de la obra, de 0 a 1. */
export function parecidoConObra(r: ResultadoBusqueda, obra: ObraParaTmdb): number {
  const mios = [obra.tituloRomaji, obra.tituloIngles, obra.tituloNativo, ...obra.sinonimos]
    .filter((x): x is string => !!x)
    .map(sinTemporada);
  const suyos = [r.name, r.original_name, r.title, r.original_title].filter((x): x is string => !!x).map(sinTemporada);
  let mejor = 0;
  for (const a of suyos) for (const b of mios) mejor = Math.max(mejor, parecido(a, b));
  return mejor;
}

/** Entre los resultados, el que más se parece si llega al umbral firme; a igualdad, el más popular. */
export function elegirResultado(resultados: readonly ResultadoBusqueda[], obra: ObraParaTmdb): ResultadoBusqueda | null {
  const orden = resultados
    .map((r) => ({ r, p: parecidoConObra(r, obra) }))
    .filter((x) => x.p >= UMBRAL_AUTO)
    .sort((a, b) => b.p - a.p || (b.r.popularity ?? 0) - (a.r.popularity ?? 0));
  return orden[0]?.r ?? null;
}

/** El fondo sin texto de más nota; si no hay ninguno sin texto, el de más nota. */
export function elegirFondo(fondos: readonly ImagenTmdb[]): string | null {
  const porNota = (a: ImagenTmdb, b: ImagenTmdb) => b.vote_average - a.vote_average || b.width - a.width;
  const sinTexto = fondos.filter((f) => f.iso_639_1 === null).sort(porNota);
  return (sinTexto[0] ?? [...fondos].sort(porNota)[0])?.file_path ?? null;
}

/** Después del idioma original: japonés, inglés (suele traer el título romanizado o el original) y español. */
const IDIOMAS_LOGO = ['ja', 'en', 'es'];

/**
 * El logo en el idioma original de la obra; si no hay, japonés, inglés, español y el que haya. Dentro de cada
 * idioma, el de más nota.
 */
export function elegirLogo(logos: readonly ImagenTmdb[], idiomaOriginal: string | null = null): string | null {
  const porNota = (a: ImagenTmdb, b: ImagenTmdb) => b.vote_average - a.vote_average || b.width - a.width;
  const orden = [...new Set([...(idiomaOriginal ? [idiomaOriginal] : []), ...IDIOMAS_LOGO])];
  for (const idioma of orden) {
    const l = logos.filter((x) => x.iso_639_1 === idioma).sort(porNota)[0];
    if (l) return l.file_path;
  }
  return [...logos].sort(porNota)[0]?.file_path ?? null;
}

export function crearClienteTmdb(op: OpcionesTmdb): ClienteTmdb {
  const hacerFetch = op.fetch ?? fetch;

  async function pedir<T>(ruta: string, params: Record<string, string> = {}): Promise<T | null> {
    const clave = await op.clave();
    if (!clave) return null;
    const url = new URL(URL_TMDB + ruta);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (clave.startsWith('eyJ')) headers.authorization = `Bearer ${clave}`;
    else url.searchParams.set('api_key', clave);
    let res: Response;
    try {
      res = await hacerFetch(url.toString(), { headers });
    } catch (e) {
      throw new SinRed(`sin respuesta de TMDB: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    if (res.status === 401) throw new NoAutorizado('TMDB rechazó la clave');
    if (res.status === 429 || res.status >= 500) throw new SinRed(`TMDB no responde bien (HTTP ${res.status})`);
    if (!res.ok) throw new FuenteCambio(`TMDB respondió HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async function buscarImagenes(obra: ObraParaTmdb): Promise<ImagenesTmdb | null> {
    const tipo = obra.formato === 'MOVIE' ? 'movie' : 'tv';
    const titulos = [...new Set([obra.tituloIngles, obra.tituloRomaji, obra.tituloNativo].filter((x): x is string => !!x))];
    for (const titulo of titulos) {
      const encontrado = await pedir<{ results?: ResultadoBusqueda[] }>(`/search/${tipo}`, {
        query: titulo,
        include_adult: 'false',
      });
      if (encontrado === null) return null; // sin clave
      const elegido = elegirResultado(encontrado.results ?? [], obra);
      if (!elegido) continue;
      const imagenes = await pedir<{ backdrops?: ImagenTmdb[]; logos?: ImagenTmdb[] }>(`/${tipo}/${elegido.id}/images`, {
        include_image_language: 'es,en,ja,null',
      });
      return {
        tmdbId: elegido.id,
        tipo,
        fondo: elegirFondo(imagenes?.backdrops ?? []),
        logo: elegirLogo(imagenes?.logos ?? [], elegido.original_language ?? null),
      };
    }
    return null;
  }

  async function probar(): Promise<void> {
    const r = await pedir<unknown>('/configuration');
    if (r === null) throw new NoAutorizado('no hay clave de TMDB');
  }

  return { buscarImagenes, probar };
}

/** Dirección completa de una ruta de imagen de TMDB (`tamano`: `original`, `w1280`, `w500`…). */
export function urlImagenTmdb(ruta: string, tamano: string): string {
  return `${URL_IMAGENES_TMDB}/${tamano}${ruta}`;
}
