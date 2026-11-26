import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Ficha } from '../../../core/src/index.ts';
import { MAX_EDAD_CACHE_MS, prepararReproduccion, principalDeSerie, type DepsReanudar } from './reanudar.ts';

const ficha = (...numeros: number[]): Ficha => ({
  title: 'Serie', episodes: numeros.map((n) => ({ id: n, number: n })), synopsis: '', genres: [], status: '', anio: null,
});

const AHORA = 1_700_000_000_000;
/** Una fila de la caché: reciente por defecto. */
const fila = (f: Ficha | string, edadMs = 1000) => ({ datos: typeof f === 'string' ? f : JSON.stringify(f), consultadoEn: AHORA - edadMs });

function deps(extra: Partial<DepsReanudar> = {}): DepsReanudar & { pedidas: string[]; guardadas: { slug: string; datos: string }[] } {
  const pedidas: string[] = [];
  const guardadas: { slug: string; datos: string }[] = [];
  return {
    pedidas,
    guardadas,
    leerCache: async () => null,
    guardarCache: async (slug, datos) => void guardadas.push({ slug, datos }),
    ahora: () => AHORA,
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
  const d = deps({ leerCache: async () => fila(ficha(3, 1, 2)) });
  assert.deepEqual(await prepararReproduccion(d, SERIE, 2), { numeros: [1, 2, 3], numero: 2, idioma: 'SUB' });
  assert.deepEqual(d.pedidas, []);
});

test('prepararReproduccion pide a la fuente si la guardada no tiene el episodio o no hay', async () => {
  const sinEl = deps({ leerCache: async () => fila(ficha(1, 2)) });
  assert.deepEqual((await prepararReproduccion(sinEl, SERIE, 4)).numeros, [1, 2, 3, 4]);
  assert.deepEqual(sinEl.pedidas, ['serie']);
  const rota = deps({ leerCache: async () => fila('no es json') });
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

test('prepararReproduccion pide a la fuente si el episodio es el último de la lista guardada', async () => {
  const d = deps({ leerCache: async () => fila(ficha(1, 2, 3)) });
  assert.deepEqual((await prepararReproduccion(d, SERIE, 3)).numeros, [1, 2, 3, 4]);
  assert.deepEqual(d.pedidas, ['serie']);
});

test('principalDeSerie: todo visto en la guardada, la fuente trae un episodio nuevo', async () => {
  const d = deps({ leerCache: async () => fila(ficha(1, 2)), pedir: async () => ficha(1, 2, 3), vistos: async () => [1, 2] });
  assert.deepEqual(await principalDeSerie(d, SERIE), { tipo: 'ver', numero: 3 });
});

test('principalDeSerie: todo visto y la fuente falla, se queda con la guardada sin lanzar', async () => {
  const d = deps({
    leerCache: async () => fila(ficha(1, 2)),
    pedir: async () => { throw new Error('red'); },
    vistos: async () => [1, 2],
  });
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await principalDeSerie(d, SERIE), { tipo: 'repetir', numero: 1 });
  } finally {
    console.error = original;
  }
});

test('prepararReproduccion pide a la fuente si la lista guardada es más vieja que el máximo, aunque tenga el episodio', async () => {
  const d = deps({ leerCache: async () => fila(ficha(1, 2, 3), MAX_EDAD_CACHE_MS + 1) });
  assert.deepEqual((await prepararReproduccion(d, SERIE, 2)).numeros, [1, 2, 3, 4]);
  assert.deepEqual(d.pedidas, ['serie']);
  const justa = deps({ leerCache: async () => fila(ficha(1, 2, 3), MAX_EDAD_CACHE_MS - 1) });
  await prepararReproduccion(justa, SERIE, 2);
  assert.deepEqual(justa.pedidas, []);
});

test('lo que se pide a la fuente se guarda en la caché', async () => {
  const d = deps();
  await prepararReproduccion(d, SERIE, 1);
  assert.deepEqual(d.guardadas, [{ slug: 'serie', datos: JSON.stringify(ficha(1, 2, 3, 4)) }]);
  const deCache = deps({ leerCache: async () => fila(ficha(1, 2, 3)) });
  await prepararReproduccion(deCache, SERIE, 1);
  assert.deepEqual(deCache.guardadas, []);
});

test('si guardar la caché falla, se registra y la operación sigue', async () => {
  const d = deps({ guardarCache: async () => { throw new Error('disco'); } });
  const registros: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void registros.push(a);
  try {
    assert.deepEqual((await prepararReproduccion(d, SERIE, 2)).numeros, [1, 2, 3, 4]);
  } finally {
    console.error = original;
  }
  assert.equal(registros.length, 1);
  assert.equal(registros[0][1], 'Error');
});
