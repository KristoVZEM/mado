import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoRespaldoDe, esperaDe, esperaMs, etiquetaDia, nombreCopia, respaldoDebido } from './datosAjustes.ts';

const DIA = 86_400_000;

test('el respaldo automático está apagado por defecto y lo inválido lo apaga', () => {
  assert.equal(autoRespaldoDe(null), 0);
  assert.equal(autoRespaldoDe('x'), 0);
  assert.equal(autoRespaldoDe('9'), 0);
  assert.equal(autoRespaldoDe('2'), 2);
});

test('la espera por defecto es de 15 segundos', () => {
  assert.equal(esperaMs(esperaDe(null)), 15_000);
  assert.equal(esperaMs(esperaDe('x')), 15_000);
  assert.equal(esperaMs(esperaDe('0')), 10_000);
  assert.equal(esperaMs(esperaDe('3')), 60_000);
  assert.equal(esperaMs(99), 15_000);
});

test('«Nunca» no hace respaldos, haya o no uno previo', () => {
  assert.equal(respaldoDebido(0, 0, 10 * DIA), false);
  assert.equal(respaldoDebido(0, 1, 10 * DIA), false);
});

test('sin respaldo previo toca hacerlo', () => {
  assert.equal(respaldoDebido(1, 0, 10 * DIA), true);
  assert.equal(respaldoDebido(3, Number.NaN, 10 * DIA), true);
});

test('toca cuando pasó el periodo entero, y no antes', () => {
  const t0 = 100 * DIA;
  assert.equal(respaldoDebido(1, t0, t0 + DIA - 1), false);
  assert.equal(respaldoDebido(1, t0, t0 + DIA), true);
  assert.equal(respaldoDebido(2, t0, t0 + 7 * DIA - 1), false);
  assert.equal(respaldoDebido(2, t0, t0 + 7 * DIA), true);
  assert.equal(respaldoDebido(3, t0, t0 + 29 * DIA), false);
  assert.equal(respaldoDebido(3, t0, t0 + 30 * DIA), true);
});

test('si el reloj retrocedió no se hace un respaldo', () => {
  assert.equal(respaldoDebido(1, 200 * DIA, 100 * DIA), false);
});

test('la etiqueta es la fecha local con ceros', () => {
  const ms = new Date(2026, 0, 5, 23, 59).getTime();
  assert.equal(etiquetaDia(ms), '2026-01-05');
  assert.equal(nombreCopia(ms), 'ukiku-2026-01-05.db');
  assert.match(etiquetaDia(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
});
