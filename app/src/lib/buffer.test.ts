import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conExcluido, estaEsperandoDatos, fraccionAlmacenada } from './buffer.ts';

test('fraccionAlmacenada da la parte descargada de la barra', () => {
  assert.equal(fraccionAlmacenada(300, 120, 1200), 0.25);
});

test('fraccionAlmacenada nunca queda por detrás de la posición ni pasa de 1', () => {
  assert.equal(fraccionAlmacenada(100, 600, 1200), 0.5);
  assert.equal(fraccionAlmacenada(5000, 0, 1200), 1);
});

test('fraccionAlmacenada es 0 sin duración o sin dato de caché', () => {
  assert.equal(fraccionAlmacenada(300, 0, 0), 0);
  assert.equal(fraccionAlmacenada(null, 100, 1200), 0);
  assert.equal(fraccionAlmacenada(Number.NaN, 100, 1200), 0);
});

test('estaEsperandoDatos: sin caché o saltando, salvo con el vídeo terminado', () => {
  assert.equal(estaEsperandoDatos({ pausadoPorCache: true, saltando: false, terminado: false }), true);
  assert.equal(estaEsperandoDatos({ pausadoPorCache: false, saltando: true, terminado: false }), true);
  assert.equal(estaEsperandoDatos({ pausadoPorCache: false, saltando: false, terminado: false }), false);
  assert.equal(estaEsperandoDatos({ pausadoPorCache: true, saltando: true, terminado: true }), false);
});

test('conExcluido añade el servidor que falló sin repetir ni tocar la lista original', () => {
  const antes = ['HLS'];
  assert.deepEqual(conExcluido(antes, 'MP4Upload'), ['HLS', 'MP4Upload']);
  assert.deepEqual(conExcluido(antes, 'HLS'), ['HLS']);
  assert.deepEqual(conExcluido(antes, undefined), ['HLS']);
  assert.deepEqual(antes, ['HLS']);
});
