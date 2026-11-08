import type { CandidatoAnilist } from './emparejar.ts';
import type { ClienteAnilist } from './cliente.ts';
import type { MediaAnilist, RelacionAnilist } from './tipos.ts';

const FRAGMENTO = `fragment CamposMedia on Media {
  id idMal isAdult
  title { romaji english native }
  synonyms seasonYear startDate { year }
  episodes status format description(asHtml: false) genres averageScore
  coverImage { large } bannerImage
  nextAiringEpisode { episode airingAt }
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType node { id type title { romaji } } } }
}`;

const TITULOS_POR_PETICION = 3;

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const ent = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);
const https = (v: unknown): string | null => {
  const t = txt(v);
  return t !== null && t.startsWith('https://') ? t : null;
};

/** Normaliza una obra de la API. `null` si no sirve (sin id, sin título, o contenido adulto). */
export function parseMedia(raw: any): MediaAnilist | null {
  if (!raw || typeof raw !== 'object' || raw.isAdult === true) return null;
  const id = ent(raw.id);
  if (id === null || id <= 0) return null;
  const romaji = txt(raw.title?.romaji) ?? txt(raw.title?.english) ?? txt(raw.title?.native);
  if (romaji === null) return null;
  const relaciones: RelacionAnilist[] = (Array.isArray(raw.relations?.edges) ? raw.relations.edges : [])
    .filter((e: any) => e?.node?.type === 'ANIME' && ent(e.node.id) !== null)
    .map((e: any) => ({
      anilistId: ent(e.node.id)!,
      tipo: txt(e.relationType) ?? 'OTHER',
      titulo: txt(e.node.title?.romaji) ?? '',
    }));
  return {
    anilistId: id,
    malId: ent(raw.idMal),
    tituloRomaji: romaji,
    tituloIngles: txt(raw.title?.english),
    tituloNativo: txt(raw.title?.native),
    sinopsis: txt(raw.description),
    generos: (Array.isArray(raw.genres) ? raw.genres : []).map(txt).filter((g: string | null): g is string => g !== null),
    formato: txt(raw.format),
    estudio: txt(raw.studios?.nodes?.[0]?.name),
    puntuacion: ent(raw.averageScore),
    episodios: ent(raw.episodes),
    estado: txt(raw.status),
    portada: https(raw.coverImage?.large),
    banner: https(raw.bannerImage),
    siguienteEp: ent(raw.nextAiringEpisode?.episode),
    siguienteEn: ent(raw.nextAiringEpisode?.airingAt),
    relaciones,
    sinonimos: (Array.isArray(raw.synonyms) ? raw.synonyms : []).map(txt).filter((s: string | null): s is string => s !== null),
    anio: ent(raw.seasonYear) ?? ent(raw.startDate?.year),
  };
}

/** Una consulta con `n` búsquedas por título, cada una con su alias `b0…` y su variable `$t0…`. */
export function consultaBuscar(n: number): string {
  const vars = Array.from({ length: n }, (_, i) => `$t${i}: String`).join(', ');
  const campos = Array.from(
    { length: n },
    (_, i) => `b${i}: Page(perPage: 5) { media(search: $t${i}, type: ANIME, sort: SEARCH_MATCH) { ...CamposMedia } }`,
  ).join('\n  ');
  return `query (${vars}) {\n  ${campos}\n}\n${FRAGMENTO}`;
}

/** Candidatos para cada título, alineados con `titulos`. Agrupa varias búsquedas por petición. */
export async function buscarCandidatos(cliente: ClienteAnilist, titulos: readonly string[]): Promise<MediaAnilist[][]> {
  const salida: MediaAnilist[][] = [];
  for (let i = 0; i < titulos.length; i += TITULOS_POR_PETICION) {
    const grupo = titulos.slice(i, i + TITULOS_POR_PETICION);
    const variables = Object.fromEntries(grupo.map((t, j) => [`t${j}`, t]));
    const data = await cliente.consultar<Record<string, any>>(consultaBuscar(grupo.length), variables);
    grupo.forEach((_, j) => {
      const lista = Array.isArray(data?.[`b${j}`]?.media) ? data[`b${j}`].media : [];
      salida.push(lista.map(parseMedia).filter((m: MediaAnilist | null): m is MediaAnilist => m !== null));
    });
  }
  return salida;
}

const CONSULTA_AGENDA = `query ($desde: Int, $hasta: Int, $pagina: Int) {
  Page(page: $pagina, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $desde, airingAt_lesser: $hasta, sort: TIME) {
      episode airingAt media { ...CamposMedia }
    }
  }
}
${FRAGMENTO}`;

export interface ItemAgenda {
  anilistId: number;
  episodio: number;
  /** Segundos desde 1970. */
  emiteEn: number;
}

/** La agenda de emisión entre `desdeS` y `hastaS` (segundos), con las obras sin repetir. */
export async function agendaSemana(
  cliente: ClienteAnilist,
  desdeS: number,
  hastaS: number,
  maxPaginas = 6,
): Promise<{ medias: MediaAnilist[]; items: ItemAgenda[] }> {
  const medias = new Map<number, MediaAnilist>();
  const items: ItemAgenda[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const data = await cliente.consultar<any>(CONSULTA_AGENDA, { desde: desdeS, hasta: hastaS, pagina });
    for (const a of Array.isArray(data?.Page?.airingSchedules) ? data.Page.airingSchedules : []) {
      const media = parseMedia(a?.media);
      const episodio = ent(a?.episode);
      const emiteEn = ent(a?.airingAt);
      if (!media || episodio === null || episodio <= 0 || emiteEn === null) continue;
      if (!medias.has(media.anilistId)) medias.set(media.anilistId, media);
      items.push({ anilistId: media.anilistId, episodio, emiteEn });
    }
    if (data?.Page?.pageInfo?.hasNextPage !== true) break;
  }
  return { medias: [...medias.values()], items };
}

/** Los datos de una obra que necesita el emparejador. */
export function aCandidato(m: MediaAnilist): CandidatoAnilist {
  return {
    anilistId: m.anilistId,
    tituloRomaji: m.tituloRomaji,
    tituloIngles: m.tituloIngles,
    tituloNativo: m.tituloNativo,
    sinonimos: m.sinonimos,
    anio: m.anio,
    episodios: m.episodios,
  };
}
