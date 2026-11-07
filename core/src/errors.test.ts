import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SinRed, Desafio, SinServidor, FuenteCambio } from './errors.ts';

test('cada error es un Error con su propia clase y nombre', () => {
  const casos = [
    [new SinRed('x'), SinRed, 'SinRed'],
    [new Desafio('x'), Desafio, 'Desafio'],
    [new FuenteCambio('x'), FuenteCambio, 'FuenteCambio'],
    [new SinServidor('x'), SinServidor, 'SinServidor'],
  ] as const;
  for (const [err, clase, nombre] of casos) {
    assert.ok(err instanceof Error);
    assert.ok(err instanceof clase);
    assert.equal(err.name, nombre);
    assert.equal(err.message, 'x');
  }
});

test('las clases no se confunden entre sí', () => {
  assert.equal(new SinRed('x') instanceof Desafio, false);
  assert.equal(new FuenteCambio('x') instanceof SinRed, false);
});

test('SinServidor guarda las causas y SinRed la causa original', () => {
  const causa = new FuenteCambio('la receta cambió');
  assert.deepEqual(new SinServidor('x', [causa]).causas, [causa]);
  assert.deepEqual(new SinServidor('x').causas, []);
  const original = new TypeError('fetch failed');
  assert.equal(new SinRed('x', { cause: original }).cause, original);
});
