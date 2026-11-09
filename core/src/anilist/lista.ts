// Consultas de la lista del usuario en AniList. Todas requieren un cliente con token.

import { FuenteCambio, NoAutorizado, SinRed } from '../errors.ts';
import type { ClienteAnilist } from './cliente.ts';
import { aEstadoLocal, STATUS, type RemotoSync, type Subida } from './sync.ts';

const MAX_TROZOS = 20;
const POR_LOTE = 10;

const ent = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

function aRemoto(mediaId: unknown, e: any): RemotoSync | null {
  const anilistId = ent(mediaId);
  const estado = typeof e?.status === 'string' ? aEstadoLocal(e.status) : null;
  const progreso = ent(e?.progress);
  const segundos = ent(e?.updatedAt);
  if (anilistId === null || anilistId <= 0 || estado === null || progreso === null || segundos === null) return null;
  return { anilistId, estado, actualizado: segundos * 1000, progreso };
}

/** El usuario dueño del token. */
export async function obtenerUsuario(cliente: ClienteAnilist): Promise<{ id: number; nombre: string }> {
  const data = await cliente.consultar<any>('query { Viewer { id name } }');
  const id = ent(data?.Viewer?.id);
  const nombre = data?.Viewer?.name;
  if (id === null || id <= 0 || typeof nombre !== 'string' || nombre.trim() === '') {
    throw new FuenteCambio('AniList: la respuesta no trae el usuario');
  }
  return { id, nombre };
}

const CONSULTA_LISTA = `query ($u: Int, $chunk: Int) {
  MediaListCollection(userId: $u, type: ANIME, chunk: $chunk, perChunk: 500, forceSingleCompletedList: true) {
    hasNextChunk
    lists { entries { mediaId status progress updatedAt } }
  }
}`;

/** Toda la lista de anime del usuario. Entradas con datos raros se omiten. */
export async function listaUsuario(cliente: ClienteAnilist, userId: number): Promise<RemotoSync[]> {
  const salida = new Map<number, RemotoSync>();
  for (let chunk = 1; chunk <= MAX_TROZOS; chunk++) {
    const data = await cliente.consultar<any>(CONSULTA_LISTA, { u: userId, chunk });
    const col = data?.MediaListCollection;
    for (const lista of Array.isArray(col?.lists) ? col.lists : []) {
      for (const e of Array.isArray(lista?.entries) ? lista.entries : []) {
        const r = aRemoto(e?.mediaId, e);
        if (r) salida.set(r.anilistId, r);
      }
    }
    if (col?.hasNextChunk !== true) break;
  }
  return [...salida.values()];
}

/** La entrada del usuario del token para una obra, o `null` si no la tiene en su lista. */
export async function entradaDe(cliente: ClienteAnilist, mediaId: number): Promise<RemotoSync | null> {
  const data = await cliente.consultar<any>(
    'query ($m: Int) { Media(id: $m, type: ANIME) { mediaListEntry { status progress updatedAt } } }',
    { m: mediaId },
  );
  const e = data?.Media?.mediaListEntry;
  return e ? aRemoto(mediaId, e) : null;
}

export interface ResultadoSubida {
  ok: number;
  fallos: { anilistId: number; motivo: string }[];
}

function mutacion(lote: readonly Subida[]): { query: string; variables: Record<string, unknown> } {
  const decl: string[] = [];
  const campos: string[] = [];
  const variables: Record<string, unknown> = {};
  lote.forEach((c, i) => {
    decl.push(`$m${i}: Int`);
    variables[`m${i}`] = c.anilistId;
    const args = [`mediaId: $m${i}`];
    if (c.estado !== undefined) {
      decl.push(`$s${i}: MediaListStatus`);
      variables[`s${i}`] = STATUS[c.estado];
      args.push(`status: $s${i}`);
    }
    if (c.progreso !== undefined) {
      decl.push(`$p${i}: Int`);
      variables[`p${i}`] = c.progreso;
      args.push(`progress: $p${i}`);
    }
    campos.push(`g${i}: SaveMediaListEntry(${args.join(', ')}) { id }`);
  });
  return { query: `mutation (${decl.join(', ')}) {\n  ${campos.join('\n  ')}\n}`, variables };
}

/**
 * Crea o actualiza entradas, 10 por petición. Si un lote falla por un error de la consulta, lo reintenta
 * de una en una para saber cuáles fallan. `NoAutorizado` y `SinRed` se propagan: no tiene sentido seguir.
 */
export async function guardarEntradas(cliente: ClienteAnilist, cambios: readonly Subida[]): Promise<ResultadoSubida> {
  const r: ResultadoSubida = { ok: 0, fallos: [] };
  for (let i = 0; i < cambios.length; i += POR_LOTE) {
    const lote = cambios.slice(i, i + POR_LOTE);
    try {
      const m = mutacion(lote);
      await cliente.consultar(m.query, m.variables);
      r.ok += lote.length;
    } catch (e) {
      if (e instanceof NoAutorizado || e instanceof SinRed || !(e instanceof FuenteCambio)) throw e;
      for (const c of lote) {
        try {
          const m = mutacion([c]);
          await cliente.consultar(m.query, m.variables);
          r.ok++;
        } catch (e2) {
          if (!(e2 instanceof FuenteCambio)) throw e2;
          r.fallos.push({ anilistId: c.anilistId, motivo: e2.message });
        }
      }
    }
  }
  return r;
}
