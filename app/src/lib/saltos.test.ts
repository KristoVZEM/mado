import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SALTO_CORTO_S, SALTO_LARGO_S, formatearTiempo, tiempoEnPosicion } from './saltos.ts';

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

test('tiempoEnPosicion convierte la x del cursor en segundos sobre la barra', () => {
  // Barra de 200 px que empieza en x=100, vídeo de 1000 s.
  assert.equal(tiempoEnPosicion(100, 100, 200, 1000), 0);
  assert.equal(tiempoEnPosicion(200, 100, 200, 1000), 500);
  assert.equal(tiempoEnPosicion(300, 100, 200, 1000), 1000);
});

test('tiempoEnPosicion recorta fuera de la barra', () => {
  assert.equal(tiempoEnPosicion(50, 100, 200, 1000), 0);
  assert.equal(tiempoEnPosicion(900, 100, 200, 1000), 1000);
});

test('tiempoEnPosicion da 0 sin duración o sin ancho válidos', () => {
  assert.equal(tiempoEnPosicion(150, 100, 200, 0), 0);
  assert.equal(tiempoEnPosicion(150, 100, 200, Number.NaN), 0);
  assert.equal(tiempoEnPosicion(150, 100, 0, 1000), 0);
});
