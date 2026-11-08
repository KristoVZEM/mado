import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VELOCIDADES, etiquetaVelocidad } from './velocidad.ts';

test('las velocidades ofrecidas son 0,75× 1× 1,25× 1,5× y 2×, en orden', () => {
  assert.deepEqual([...VELOCIDADES], [0.75, 1, 1.25, 1.5, 2]);
});

test('etiquetaVelocidad usa coma decimal y el signo ×', () => {
  assert.equal(etiquetaVelocidad(1), '1×');
  assert.equal(etiquetaVelocidad(0.75), '0,75×');
  assert.equal(etiquetaVelocidad(1.25), '1,25×');
  assert.equal(etiquetaVelocidad(1.5), '1,5×');
  assert.equal(etiquetaVelocidad(2), '2×');
});
