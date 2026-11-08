import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatoTiempo, fraccionVista, idiomaGuardado, textoRestante, textoTarjeta, validarSalto } from './continuar.ts';

test('formatoTiempo', () => {
  assert.equal(formatoTiempo(0), '0:00');
  assert.equal(formatoTiempo(65.9), '1:05');
  assert.equal(formatoTiempo(3725), '1:02:05');
  assert.equal(formatoTiempo(-3), '0:00');
  assert.equal(formatoTiempo(Number.NaN), '0:00');
});

test('textoTarjeta', () => {
  assert.equal(textoTarjeta(3, 245, 1420), 'Ep. 3 · 4:05 / 23:40');
  assert.equal(textoTarjeta(1.5, 90, 0), 'Ep. 1.5 · 1:30');
});

test('fraccionVista', () => {
  assert.equal(fraccionVista(50, 100), 0.5);
  assert.equal(fraccionVista(150, 100), 1);
  assert.equal(fraccionVista(-1, 100), 0);
  assert.equal(fraccionVista(10, 0), null);
  assert.equal(fraccionVista(Number.NaN, 100), null);
});

test('idiomaGuardado', () => {
  assert.equal(idiomaGuardado('DUB'), 'DUB');
  assert.equal(idiomaGuardado(' DUB '), 'DUB');
  assert.equal(idiomaGuardado('SUB'), 'SUB');
  assert.equal(idiomaGuardado(null), 'SUB');
  assert.equal(idiomaGuardado('dub'), 'SUB');
});

test('validarSalto', () => {
  assert.equal(validarSalto('10', 5, 60), 10);
  assert.equal(validarSalto(' 5 ', 5, 60), 5);
  assert.equal(validarSalto('4', 5, 60), null);
  assert.equal(validarSalto('61', 5, 60), null);
  assert.equal(validarSalto('7.5', 5, 60), null);
  assert.equal(validarSalto('', 5, 60), null);
  assert.equal(validarSalto('abc', 5, 60), null);
});

test('textoRestante', () => {
  assert.equal(textoRestante(3, 245, 1420), 'Ep. 3 · quedan 19:35');
  assert.equal(textoRestante(1.5, 0, 0), 'Ep. 1.5');
  assert.equal(textoRestante(2, 1500, 1400), 'Ep. 2 · quedan 0:00');
});
