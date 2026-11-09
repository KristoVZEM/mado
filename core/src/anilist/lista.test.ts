import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FuenteCambio, NoAutorizado, SinRed } from '../errors.ts';
import type { ClienteAnilist } from './cliente.ts';
import { entradaDe, guardarEntradas, listaUsuario, obtenerUsuario } from './lista.ts';

type Llamada = { query: string; variables: Record<string, unknown> };
function falso(respuestas: Array<unknown | Error>): ClienteAnilist & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    async consultar(query: string, variables: Record<string, unknown> = {}) {
      llamadas.push({ query, variables });
      const r = respuestas.shift();
      if (r instanceof Error) throw r;
      return r as any;
    },
  };
}

test('obtenerUsuario devuelve id y nombre del token', async () => {
  const c = falso([{ Viewer: { id: 42, name: 'kristo' } }]);
  assert.deepEqual(await obtenerUsuario(c), { id: 42, nombre: 'kristo' });
});

test('obtenerUsuario falla con una respuesta sin usuario', async () => {
  await assert.rejects(obtenerUsuario(falso([{ Viewer: null }])), FuenteCambio);
});

test('listaUsuario convierte estados y segundos a milisegundos, y pagina por trozos', async () => {
  const c = falso([
    { MediaListCollection: { hasNextChunk: true, lists: [{ entries: [{ mediaId: 1, status: 'CURRENT', progress: 3, updatedAt: 100 }] }] } },
    { MediaListCollection: { hasNextChunk: false, lists: [{ entries: [
      { mediaId: 2, status: 'REPEATING', progress: 0, updatedAt: 200 },
      { mediaId: 3, status: 'RARO', progress: 1, updatedAt: 300 },
      { mediaId: 4, status: 'COMPLETED', progress: 'x', updatedAt: 400 },
    ] }] } },
  ]);
  const lista = await listaUsuario(c, 42);
  assert.deepEqual(lista, [
    { anilistId: 1, estado: 1, actualizado: 100_000, progreso: 3 },
    { anilistId: 2, estado: 1, actualizado: 200_000, progreso: 0 },
  ]);
  assert.deepEqual(c.llamadas.map((l) => l.variables), [{ u: 42, chunk: 1 }, { u: 42, chunk: 2 }]);
});

test('listaUsuario se detiene tras el máximo de trozos', async () => {
  const siempre = { MediaListCollection: { hasNextChunk: true, lists: [] } };
  const c = falso(Array.from({ length: 50 }, () => siempre));
  await listaUsuario(c, 1);
  assert.equal(c.llamadas.length, 20);
});

test('entradaDe devuelve la entrada del usuario o null', async () => {
  const con = falso([{ Media: { mediaListEntry: { status: 'PAUSED', progress: 7, updatedAt: 50 } } }]);
  assert.deepEqual(await entradaDe(con, 9), { anilistId: 9, estado: 5, actualizado: 50_000, progreso: 7 });
  const sin = falso([{ Media: { mediaListEntry: null } }]);
  assert.equal(await entradaDe(sin, 9), null);
});

test('guardarEntradas agrupa en una petición, con variables y sin las ausentes', async () => {
  const c = falso([{ g0: { id: 1 }, g1: { id: 2 } }]);
  const r = await guardarEntradas(c, [
    { anilistId: 10, estado: 1, progreso: 4 },
    { anilistId: 20, progreso: 9 },
  ]);
  assert.deepEqual(r, { ok: 2, fallos: [] });
  assert.equal(c.llamadas.length, 1);
  assert.deepEqual(c.llamadas[0]!.variables, { m0: 10, s0: 'CURRENT', p0: 4, m1: 20, p1: 9 });
  assert.match(c.llamadas[0]!.query, /g0: SaveMediaListEntry\(mediaId: \$m0, status: \$s0, progress: \$p0\)/);
  assert.match(c.llamadas[0]!.query, /g1: SaveMediaListEntry\(mediaId: \$m1, progress: \$p1\)/);
});

test('guardarEntradas parte en lotes de 10', async () => {
  const cambios = Array.from({ length: 25 }, (_, i) => ({ anilistId: i + 1, estado: 1 as const }));
  const c = falso([{}, {}, {}]);
  const r = await guardarEntradas(c, cambios);
  assert.equal(c.llamadas.length, 3);
  assert.equal(r.ok, 25);
});

test('si un lote falla por FuenteCambio, reintenta de una en una y anota los fallos', async () => {
  const c = falso([new FuenteCambio('AniList: x'), { g0: { id: 1 } }, new FuenteCambio('AniList: malo')]);
  const r = await guardarEntradas(c, [{ anilistId: 1, estado: 1 }, { anilistId: 2, estado: 2 }]);
  assert.deepEqual(r, { ok: 1, fallos: [{ anilistId: 2, motivo: 'AniList: malo' }] });
});

test('NoAutorizado y SinRed no se reintentan: se propagan', async () => {
  await assert.rejects(guardarEntradas(falso([new NoAutorizado('x')]), [{ anilistId: 1, estado: 1 }]), NoAutorizado);
  await assert.rejects(guardarEntradas(falso([new SinRed('x')]), [{ anilistId: 1, estado: 1 }]), SinRed);
});

test('sin cambios no hace peticiones', async () => {
  const c = falso([]);
  assert.deepEqual(await guardarEntradas(c, []), { ok: 0, fallos: [] });
  assert.equal(c.llamadas.length, 0);
});
