import assert from 'node:assert/strict';
import { test } from 'node:test';
import { debeRefrescar, MIN_ENTRE_INTENTOS_MS, REFRESCO_MS } from './refrescoInicio.ts';

const MIN = 60_000;
const t0 = 1_000_000_000;

test('los plazos: refresco a los 10 min y no más de un intento cada 30 s', () => {
  assert.equal(REFRESCO_MS, 10 * MIN);
  assert.equal(MIN_ENTRE_INTENTOS_MS, 30_000);
});

test('si los datos son recientes y la carga fue bien, no se refresca', () => {
  assert.equal(debeRefrescar({ ahora: t0 + 5 * MIN, ultimoIntentoMs: t0, fallo: false }), false);
  assert.equal(debeRefrescar({ ahora: t0 + REFRESCO_MS - 1, ultimoIntentoMs: t0, fallo: false }), false);
});

test('pasados 10 minutos se refresca', () => {
  assert.equal(debeRefrescar({ ahora: t0 + REFRESCO_MS, ultimoIntentoMs: t0, fallo: false }), true);
  assert.equal(debeRefrescar({ ahora: t0 + 3 * 60 * MIN, ultimoIntentoMs: t0, fallo: false }), true);
});

test('si la carga anterior falló se vuelve a intentar sin esperar los 10 minutos', () => {
  assert.equal(debeRefrescar({ ahora: t0 + 2 * MIN, ultimoIntentoMs: t0, fallo: true }), true);
});

test('pero nunca dos intentos seguidos: los avisos de «ventana visible» y «con el foco» llegan juntos', () => {
  assert.equal(debeRefrescar({ ahora: t0 + 1_000, ultimoIntentoMs: t0, fallo: true }), false);
  assert.equal(debeRefrescar({ ahora: t0 + MIN_ENTRE_INTENTOS_MS - 1, ultimoIntentoMs: t0, fallo: true }), false);
  assert.equal(debeRefrescar({ ahora: t0 + MIN_ENTRE_INTENTOS_MS, ultimoIntentoMs: t0, fallo: true }), true);
  assert.equal(debeRefrescar({ ahora: t0 + 1_000, ultimoIntentoMs: t0, fallo: false }), false);
});

test('sin ninguna carga previa se refresca, y con el reloj atrasado también', () => {
  assert.equal(debeRefrescar({ ahora: t0, ultimoIntentoMs: 0, fallo: false }), true);
  assert.equal(debeRefrescar({ ahora: t0, ultimoIntentoMs: t0 + 5 * MIN, fallo: false }), true);
});
