import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOLUMEN_INICIAL, VOLUMEN_PASO, limitarVolumen } from './volumen.ts';

test('el paso es de 5 y el volumen inicial es 100', () => {
  assert.equal(VOLUMEN_PASO, 5);
  assert.equal(VOLUMEN_INICIAL, 100);
});

test('limitarVolumen recorta a 0-100 y redondea', () => {
  assert.equal(limitarVolumen(-10), 0);
  assert.equal(limitarVolumen(150), 100);
  assert.equal(limitarVolumen(42.6), 43);
});

test('limitarVolumen da el volumen inicial con valores no finitos', () => {
  assert.equal(limitarVolumen(Number.NaN), VOLUMEN_INICIAL);
  assert.equal(limitarVolumen(Number.POSITIVE_INFINITY), VOLUMEN_INICIAL);
});
