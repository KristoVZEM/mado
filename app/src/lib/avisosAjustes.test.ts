import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALCANCES_AVISOS,
  INTERVALOS_AVISOS,
  alcanceAvisosDe,
  incluirFavoritasDe,
  intervaloAvisosDe,
  intervaloAvisosMs,
} from './avisosAjustes.ts';

test('el intervalo por defecto es cada 30 minutos', () => {
  assert.equal(intervaloAvisosMs(intervaloAvisosDe(null)), 30 * 60_000);
  assert.equal(intervaloAvisosMs(intervaloAvisosDe('abc')), 30 * 60_000);
  assert.equal(intervaloAvisosMs(intervaloAvisosDe('9')), 30 * 60_000);
});

test('cada posición guardada da su intervalo en milisegundos', () => {
  assert.equal(intervaloAvisosMs(intervaloAvisosDe('0')), 15 * 60_000);
  assert.equal(intervaloAvisosMs(intervaloAvisosDe('2')), 60 * 60_000);
  assert.equal(intervaloAvisosMs(intervaloAvisosDe('4')), 360 * 60_000);
});

test('una posición fuera de la lista no rompe: cae a 30 minutos', () => {
  assert.equal(intervaloAvisosMs(99), 30 * 60_000);
  assert.equal(intervaloAvisosMs(-1), 30 * 60_000);
});

test('los intervalos están en orden creciente y no se repiten', () => {
  const m = INTERVALOS_AVISOS.map((i) => i.minutos);
  assert.deepEqual(m, [...m].sort((a, b) => a - b));
  assert.equal(new Set(m).size, m.length);
});

test('el alcance por defecto es solo lo que estoy viendo', () => {
  assert.equal(incluirFavoritasDe(alcanceAvisosDe(null)), false);
  assert.equal(incluirFavoritasDe(alcanceAvisosDe('x')), false);
  assert.equal(incluirFavoritasDe(alcanceAvisosDe('2')), false);
  assert.equal(incluirFavoritasDe(alcanceAvisosDe('1')), true);
  assert.equal(incluirFavoritasDe(99), false);
  assert.equal(ALCANCES_AVISOS.length, 2);
});
