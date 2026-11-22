import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Ficha } from '../../../core/src/index.ts';
import { cargarEpisodiosConCache, type DepsEpisodios } from './episodiosServicio.ts';

const ficha = (n: number): Ficha => ({
  title: 'Serie',
  episodes: Array.from({ length: n }, (_, i) => ({ id: i + 1, number: i + 1 })),
  synopsis: '',
  genres: [],
  status: '',
  anio: null,
});

function deps(over: Partial<DepsEpisodios> = {}) {
  const guardadas: Array<{ slug: string; datos: string }> = [];
  const pedidas: string[] = [];
  const d: DepsEpisodios = {
    leerCache: async () => null,
    guardarCache: async (slug, datos) => void guardadas.push({ slug, datos }),
    pedir: async (slug) => (pedidas.push(slug), ficha(3)),
    ...over,
  };
  return { d, guardadas, pedidas };
}

/** Anota cada ficha que se enseña, con su origen y en qué orden llegó respecto a la petición. */
function vigilante() {
  const mostradas: Array<{ episodios: number; origen: string }> = [];
  return { mostradas, alMostrar: (f: Ficha, origen: string) => void mostradas.push({ episodios: f.episodes.length, origen }) };
}

test('sin caché pide a la fuente, la enseña y la guarda', async () => {
  const { d, guardadas, pedidas } = deps();
  const v = vigilante();
  const r = await cargarEpisodiosConCache(d, 'death-note', v.alMostrar);
  assert.deepEqual(v.mostradas, [{ episodios: 3, origen: 'fuente' }]);
  assert.deepEqual(pedidas, ['death-note']);
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].slug, 'death-note');
  assert.equal(JSON.parse(guardadas[0].datos).episodes.length, 3);
  assert.equal(r.error, null);
  assert.equal(r.ficha?.episodes.length, 3);
});

test('con caché la enseña ANTES de que responda la fuente y luego la sustituye por la fresca', async () => {
  const orden: string[] = [];
  const { d } = deps({
    leerCache: async () => JSON.stringify(ficha(2)),
    pedir: async () => {
      orden.push('pide');
      return ficha(5);
    },
  });
  const r = await cargarEpisodiosConCache(d, 's', (f, origen) => orden.push(`${origen}:${f.episodes.length}`));
  assert.deepEqual(orden, ['cache:2', 'pide', 'fuente:5']);
  assert.equal(r.ficha?.episodes.length, 5);
  assert.equal(r.error, null);
});

test('si la fuente falla y había caché, se queda con la caché y devuelve el error', async () => {
  const fallo = new Error('sin red');
  const { d, guardadas } = deps({
    leerCache: async () => JSON.stringify(ficha(4)),
    pedir: async () => {
      throw fallo;
    },
  });
  const v = vigilante();
  const r = await cargarEpisodiosConCache(d, 's', v.alMostrar);
  assert.deepEqual(v.mostradas, [{ episodios: 4, origen: 'cache' }]);
  assert.equal(r.error, fallo);
  assert.equal(r.ficha?.episodes.length, 4);
  assert.equal(guardadas.length, 0, 'un fallo no pisa la caché');
});

test('si la fuente falla y no había caché, no hay ficha y sí error', async () => {
  const fallo = new Error('sin red');
  const { d } = deps({
    pedir: async () => {
      throw fallo;
    },
  });
  const v = vigilante();
  const r = await cargarEpisodiosConCache(d, 's', v.alMostrar);
  assert.deepEqual(v.mostradas, []);
  assert.equal(r.ficha, null);
  assert.equal(r.error, fallo);
});

test('una caché corrupta se ignora y se actúa como si no hubiera', async () => {
  const { d, pedidas } = deps({ leerCache: async () => '{"roto":' });
  const v = vigilante();
  const r = await cargarEpisodiosConCache(d, 's', v.alMostrar);
  assert.deepEqual(v.mostradas, [{ episodios: 3, origen: 'fuente' }]);
  assert.equal(pedidas.length, 1);
  assert.equal(r.error, null);
});

test('una caché ilegible (la base falla) no impide pedir a la fuente', async () => {
  const { d } = deps({
    leerCache: async () => {
      throw new Error('base no disponible');
    },
  });
  const r = await cargarEpisodiosConCache(d, 's', () => {});
  assert.equal(r.ficha?.episodes.length, 3);
  assert.equal(r.error, null);
});

test('un guardado que falla no estropea el resultado', async () => {
  const { d } = deps({
    guardarCache: async () => {
      throw new Error('base no disponible');
    },
  });
  const r = await cargarEpisodiosConCache(d, 's', () => {});
  assert.equal(r.ficha?.episodes.length, 3);
  assert.equal(r.error, null);
});
