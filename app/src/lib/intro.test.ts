import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aniskipActivoDe, cambioDeCorte, consultable, duracionClave, introVisible, MARGEN_FIN_S } from './intro.ts';

const tramo = { inicio: 60, fin: 150 };

test('el botón se ve dentro del tramo y desaparece MARGEN_FIN_S antes del final', () => {
  assert.equal(MARGEN_FIN_S, 2);
  assert.equal(introVisible(59.9, tramo), false);
  assert.equal(introVisible(60, tramo), true);
  assert.equal(introVisible(147.9, tramo), true);
  assert.equal(introVisible(148, tramo), false);
  assert.equal(introVisible(300, tramo), false);
});

test('sin tramo o con una posición rara no se ve', () => {
  assert.equal(introVisible(70, null), false);
  assert.equal(introVisible(Number.NaN, tramo), false);
  assert.equal(introVisible(-1, tramo), false);
});

test('el ajuste está apagado salvo que valga exactamente 1', () => {
  assert.equal(aniskipActivoDe(null), false);
  assert.equal(aniskipActivoDe(undefined), false);
  assert.equal(aniskipActivoDe(''), false);
  assert.equal(aniskipActivoDe('x'), false);
  assert.equal(aniskipActivoDe('2'), false);
  assert.equal(aniskipActivoDe('0'), false);
  assert.equal(aniskipActivoDe('1'), true);
});

test('solo se consulta con malId entero, episodio entero y duración conocida', () => {
  assert.equal(consultable(1535, 1, 1377), true);
  assert.equal(consultable(1535, 0, 1377), true);
  for (const [m, e, d] of [
    [undefined, 1, 1377], [null, 1, 1377], [0, 1, 1377], [1.5, 1, 1377],
    [1535, 12.5, 1377], [1535, -1, 1377], [1535, 1, 0], [1535, 1, Number.NaN],
  ] as const) assert.equal(consultable(m, e, d), false, `${m} ${e} ${d}`);
});

test('la clave de duración es la redondeada al segundo', () => {
  assert.equal(duracionClave(1377.375), 1377);
  assert.equal(duracionClave(1436.6), 1437);
});

test('solo cuenta como otro corte una diferencia de más de 1 s', () => {
  assert.equal(cambioDeCorte(null, 1400), true);
  assert.equal(cambioDeCorte(1400, 1400.9), false);
  assert.equal(cambioDeCorte(1400, 1401), false);
  assert.equal(cambioDeCorte(1400, 1401.1), true);
  assert.equal(cambioDeCorte(1400, 1398.5), true);
});
