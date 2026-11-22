import type { Ficha } from '../../../core/src/index.ts';

/** Una serie con 20 000 episodios no existe: pasar de ahí es una caché corrupta o manipulada. */
const MAX_EPISODIOS = 20_000;

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * La `Ficha` que se guardó como JSON, o `null` si no es una (JSON roto, otra forma, episodios mal formados). Título y
 * episodios son obligatorios; sinopsis, géneros, estado y año son decoración y, si no vienen bien, quedan vacíos. Se
 * valida igual que si llegara de la fuente: el texto guardado no se da por bueno.
 */
export function fichaDeCache(texto: unknown): Ficha | null {
  if (typeof texto !== 'string') return null;
  let crudo: any;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return null;
  }
  if (crudo === null || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  if (typeof crudo.title !== 'string' || !Array.isArray(crudo.episodes) || crudo.episodes.length > MAX_EPISODIOS) return null;
  const episodes: Ficha['episodes'] = [];
  for (const e of crudo.episodes) {
    if (e === null || typeof e !== 'object' || !finito(e.id) || !finito(e.number)) return null;
    episodes.push({ id: e.id, number: e.number });
  }
  return {
    title: crudo.title,
    episodes,
    synopsis: typeof crudo.synopsis === 'string' ? crudo.synopsis : '',
    genres: Array.isArray(crudo.genres) ? crudo.genres.filter((g: unknown): g is string => typeof g === 'string') : [],
    status: typeof crudo.status === 'string' ? crudo.status : '',
    anio: Number.isInteger(crudo.anio) && crudo.anio >= 1900 && crudo.anio <= 2100 ? crudo.anio : null,
  };
}
