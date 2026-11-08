import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALTO_CORTO_S, SALTO_LARGO_S, formatearTiempo } from './saltos.ts';

test('los saltos son los acordados: 10 s corto y 85 s largo (el de Ukiku)', () => {
  assert.equal(SALTO_CORTO_S, 10);
  assert.equal(SALTO_LARGO_S, 85);
});

test('formatearTiempo da m:ss por debajo de una hora', () => {
  assert.equal(formatearTiempo(0), '0:00');
  assert.equal(formatearTiempo(5), '0:05');
  assert.equal(formatearTiempo(65), '1:05');
  assert.equal(formatearTiempo(599.9), '9:59');
});

test('formatearTiempo da h:mm:ss desde una hora', () => {
  assert.equal(formatearTiempo(3600), '1:00:00');
  assert.equal(formatearTiempo(3725.9), '1:02:05');
});

test('formatearTiempo tolera negativos y valores no finitos', () => {
  assert.equal(formatearTiempo(-5), '0:00');
  assert.equal(formatearTiempo(Number.NaN), '0:00');
  assert.equal(formatearTiempo(Number.POSITIVE_INFINITY), '0:00');
});
