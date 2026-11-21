import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IntroDe } from '../../../core/src/index.ts';
import type { FilaIntro } from './datos.ts';
import { buscarIntro, type DepsIntro } from './introServicio.ts';

const p = { malId: 1535, episodio: 1, duracion: 1377.375 };
const filaSi: FilaIntro = { malId: 1535, episodio: 1, duracionS: 1377, estado: 'si', inicio: 1, fin: 91 };
const filaNo: FilaIntro = { malId: 1535, episodio: 1, duracionS: 1377, estado: 'no', inicio: null, fin: null };

function deps(over: Partial<DepsIntro> = {}) {
  const guardadas: FilaIntro[] = [];
  const pedidas: unknown[] = [];
  const d: DepsIntro = {
    leer: async () => null,
    guardar: async (f) => void guardadas.push(f),
    pedir: async (q) => (pedidas.push(q), { estado: 'si', inicio: 1, fin: 91 } as IntroDe),
    ...over,
  };
  return { d, guardadas, pedidas };
}

test('un acierto en la caché no sale a la red', async () => {
  const { d, pedidas } = deps({ leer: async () => filaSi });
  assert.deepEqual(await buscarIntro(d, p), { inicio: 1, fin: 91 });
  assert.equal(pedidas.length, 0);
});

test('un «no hay» en la caché tampoco sale a la red y no da tramo', async () => {
  const { d, pedidas } = deps({ leer: async () => filaNo });
  assert.equal(await buscarIntro(d, p), null);
  assert.equal(pedidas.length, 0);
});

test('sin caché pide a AniSkip con la duración real y guarda el tramo con la duración redondeada', async () => {
  const { d, guardadas, pedidas } = deps();
  assert.deepEqual(await buscarIntro(d, p), { inicio: 1, fin: 91 });
  assert.deepEqual(pedidas, [p]);
  assert.deepEqual(guardadas, [filaSi]);
});

test('un «no hay» de la red se guarda', async () => {
  const { d, guardadas } = deps({ pedir: async () => ({ estado: 'no' }) });
  assert.equal(await buscarIntro(d, p), null);
  assert.deepEqual(guardadas, [filaNo]);
});

test('un error de la red no se guarda y no da tramo', async () => {
  const { d, guardadas } = deps({ pedir: async () => ({ estado: 'error' }) });
  assert.equal(await buscarIntro(d, p), null);
  assert.equal(guardadas.length, 0);
});

test('una caché rota no impide consultar, y un guardado roto no impide dar el tramo', async () => {
  const { d } = deps({
    leer: async () => { throw new Error('base no disponible'); },
    guardar: async () => { throw new Error('base no disponible'); },
  });
  assert.deepEqual(await buscarIntro(d, p), { inicio: 1, fin: 91 });
});

test('si pedir lanza, no propaga: da null', async () => {
  const { d } = deps({ pedir: async () => { throw new Error('boom'); } });
  assert.equal(await buscarIntro(d, p), null);
});

test('si no es consultable no toca ni la caché ni la red', async () => {
  const { d, pedidas } = deps({ leer: async () => { throw new Error('no debería leerse'); } });
  for (const q of [{ ...p, malId: undefined }, { ...p, episodio: 12.5 }, { ...p, duracion: 0 }]) {
    assert.equal(await buscarIntro(d, q), null);
  }
  assert.equal(pedidas.length, 0);
});
