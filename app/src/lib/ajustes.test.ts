import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITES, numeroDeAjuste, volumenInicial } from './ajustes.ts';

test('los límites coinciden con los que valida Rust', () => {
  assert.deepEqual(LIMITES.volumen, [0, 100]);
  assert.deepEqual(LIMITES.saltoCorto, [5, 60]);
  assert.deepEqual(LIMITES.saltoLargo, [30, 180]);
  assert.deepEqual(LIMITES.velocidad, [0.5, 3]);
});

test('numeroDeAjuste lee números válidos, con trim y formatos que acepta Number()', () => {
  assert.equal(numeroDeAjuste('35', 100, 0, 100), 35);
  assert.equal(numeroDeAjuste(' 50 ', 100, 0, 100), 50);
  assert.equal(numeroDeAjuste('+5', 10, 5, 60), 5);
  assert.equal(numeroDeAjuste('1e1', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('.5', 1, 0.5, 3), 0.5);
});

test('numeroDeAjuste cae al valor por defecto si falta, no es número o sale del rango', () => {
  assert.equal(numeroDeAjuste(null, 10, 5, 60), 10);
  assert.equal(numeroDeAjuste(undefined, 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('   ', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('abc', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('NaN', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('Infinity', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('4', 10, 5, 60), 10);
  assert.equal(numeroDeAjuste('61', 10, 5, 60), 10);
});

test('volumenInicial prefiere lo de la base y no migra', () => {
  assert.deepEqual(volumenInicial('40', '70'), { valor: 40, migrar: false });
});

test('volumenInicial migra el de localStorage si la base no tiene volumen', () => {
  assert.deepEqual(volumenInicial(null, '70'), { valor: 70, migrar: true });
  assert.deepEqual(volumenInicial(null, ' 70.4 '), { valor: 70, migrar: true });
});

test('volumenInicial usa 100 si no hay nada válido en ningún sitio, sin migrar', () => {
  assert.deepEqual(volumenInicial(null, null), { valor: 100, migrar: false });
  assert.deepEqual(volumenInicial(null, 'basura'), { valor: 100, migrar: false });
  assert.deepEqual(volumenInicial('basura', null), { valor: 100, migrar: false });
});

test('volumenInicial: un valor inválido en la base cuenta como ausente y puede migrar', () => {
  assert.deepEqual(volumenInicial('basura', '30'), { valor: 30, migrar: true });
});

test('volumenInicial recorta el valor de localStorage al rango 0-100', () => {
  assert.deepEqual(volumenInicial(null, '900'), { valor: 100, migrar: true });
  assert.deepEqual(volumenInicial(null, '-5'), { valor: 0, migrar: true });
});
