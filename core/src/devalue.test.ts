import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unflatten, decodePage } from './devalue.ts';

test('resuelve referencias por índice', () => {
  const r = unflatten([{ a: 1, b: 2 }, 'x', [1, 1]]) as any;
  assert.deepEqual(r, { a: 'x', b: ['x', 'x'] });
});

test('una referencia repetida apunta al mismo objeto', () => {
  const r = unflatten([{ p: 1, q: 1 }, { n: 2 }, 5]) as any;
  assert.equal(r.p, r.q);
  assert.deepEqual(r.p, { n: 5 });
});

test('-1 es undefined, -2 hueco y -3..-6 los números especiales', () => {
  const r = unflatten([{ u: -1, h: -2, n: -3, p: -4, m: -5, z: -6 }]) as any;
  assert.equal(r.u, undefined);
  assert.ok('u' in r);
  assert.equal(r.h, undefined);
  assert.ok(Number.isNaN(r.n));
  assert.equal(r.p, Infinity);
  assert.equal(r.m, -Infinity);
  assert.ok(Object.is(r.z, -0));
});

test('rechaza tipos especiales no soportados', () => {
  assert.throws(() => unflatten([['Date', '2020-01-01']]), /no soportado/);
});

test('decodePage toma el último nodo de datos', () => {
  const payload = {
    nodes: [
      null,
      { type: 'data', data: [{ user: 1 }, null] },
      { type: 'data', data: [{ title: 1 }, 'Hola'] },
    ],
  };
  assert.deepEqual(decodePage(payload), { title: 'Hola' });
});

test('decodePage falla si no hay nodo de datos', () => {
  assert.throws(() => decodePage({ nodes: [null] }), /nodo de datos/);
});

test('una clave __proto__ remota no cambia el prototipo del resultado', () => {
  const r = unflatten(JSON.parse('[{"__proto__":1},{"x":2},5]')) as any;
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.ok(Object.keys(r).includes('__proto__'));
  assert.equal(r.x, undefined);
});
import { FuenteCambio } from './errors.ts';

test('los fallos de forma lanzan FuenteCambio', () => {
  assert.throws(() => unflatten([['Date', '2020-01-01']]), FuenteCambio);
  assert.throws(() => decodePage({ nodes: [null] }), FuenteCambio);
});
