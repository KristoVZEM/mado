import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Ficha } from '../../../core/src/index.ts';
import { prepararReproduccion, principalDeSerie, type DepsReanudar } from './reanudar.ts';

const ficha = (...numeros: number[]): Ficha => ({
  title: 'Serie', episodes: numeros.map((n) => ({ id: n, number: n })), synopsis: '', genres: [], status: '', anio: null,
});

function deps(extra: Partial<DepsReanudar> = {}): DepsReanudar & { pedidas: string[] } {
  const pedidas: string[] = [];
  return {
    pedidas,
    leerCache: async () => null,
    pedir: async (slug) => (pedidas.push(slug), ficha(1, 2, 3, 4)),
    leerIdioma: async () => null,
    idiomaDefecto: async () => 'SUB',
    vistos: async () => [],
    progresos: async () => [],
    ...extra,
  };
}

const SERIE = { aid: 5, slug: 'serie' };

test('prepararReproduccion usa la lista guardada si contiene el episodio y no pide a la fuente', async () => {
  const d = deps({ leerCache: async () => JSON.stringify(ficha(3, 1, 2)) });
  assert.deepEqual(await prepararReproduccion(d, SERIE, 2), { numeros: [1, 2, 3], numero: 2, idioma: 'SUB' });
  assert.deepEqual(d.pedidas, []);
});

test('prepararReproduccion pide a la fuente si la guardada no tiene el episodio o no hay', async () => {
  const sinEl = deps({ leerCache: async () => JSON.stringify(ficha(1, 2)) });
  assert.deepEqual((await prepararReproduccion(sinEl, SERIE, 4)).numeros, [1, 2, 3, 4]);
  assert.deepEqual(sinEl.pedidas, ['serie']);
  const rota = deps({ leerCache: async () => 'no es json' });
  assert.equal((await prepararReproduccion(rota, SERIE, 1)).numero, 1);
  assert.deepEqual(rota.pedidas, ['serie']);
});

test('prepararReproduccion: idioma recordado, por defecto si falta o falla al leer', async () => {
  assert.equal((await prepararReproduccion(deps({ leerIdioma: async () => 'DUB' }), SERIE, 1)).idioma, 'DUB');
  assert.equal((await prepararReproduccion(deps({ idiomaDefecto: async () => 'DUB' }), SERIE, 1)).idioma, 'DUB');
  const falla = deps({ leerIdioma: async () => { throw new Error('base'); } });
  assert.equal((await prepararReproduccion(falla, SERIE, 1)).idioma, 'SUB');
});

test('prepararReproduccion falla si el episodio ya no está en la lista', async () => {
  await assert.rejects(prepararReproduccion(deps(), SERIE, 9), /El episodio 9 ya no está en la lista/);
});

test('principalDeSerie: a medias, primero sin ver o volver a empezar (como la Ficha)', async () => {
  const aMedias = deps({ progresos: async () => [{ numero: 3, posicionS: 600, duracionS: 1400 }], vistos: async () => [1, 2] });
  assert.deepEqual(await principalDeSerie(aMedias, SERIE), { tipo: 'continuar', numero: 3 });
  assert.deepEqual(await principalDeSerie(deps({ vistos: async () => [1, 2] }), SERIE), { tipo: 'ver', numero: 3 });
  assert.deepEqual(await principalDeSerie(deps({ vistos: async () => [1, 2, 3, 4] }), SERIE), { tipo: 'repetir', numero: 1 });
  assert.equal(await principalDeSerie(deps({ pedir: async () => ficha() }), SERIE), null);
});
