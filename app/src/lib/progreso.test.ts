import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVALO_GUARDADO_MS,
  MIN_RETOMAR_S,
  SALTO_GRANDE_S,
  UMBRAL_VISTO,
  anterioresDe,
  debeGuardar,
  esVisto,
  posicionDeRetoma,
} from './progreso.ts';

test('los umbrales son los decididos: 85 %, 60 s, 10 s y 5 s', () => {
  assert.equal(UMBRAL_VISTO, 0.85);
  assert.equal(MIN_RETOMAR_S, 60);
  assert.equal(INTERVALO_GUARDADO_MS, 10_000);
  assert.equal(SALTO_GRANDE_S, 5);
});

test('esVisto: a partir del 85 % de la duración', () => {
  assert.equal(esVisto(0, 1400), false);
  assert.equal(esVisto(1189, 1400), false); // 84,93 %
  assert.equal(esVisto(1190, 1400), true); // 85 %
  assert.equal(esVisto(1400, 1400), true);
});

test('esVisto: sin duración conocida o con valores raros nunca es visto', () => {
  assert.equal(esVisto(100, 0), false);
  assert.equal(esVisto(100, Number.NaN), false);
  assert.equal(esVisto(Number.NaN, 1400), false);
  assert.equal(esVisto(100, Number.POSITIVE_INFINITY), false);
});

test('posicionDeRetoma: retoma desde 60 s; por debajo, o sin dato, empieza en 0', () => {
  assert.equal(posicionDeRetoma(null), 0);
  assert.equal(posicionDeRetoma(undefined), 0);
  assert.equal(posicionDeRetoma(0), 0);
  assert.equal(posicionDeRetoma(59.9), 0);
  assert.equal(posicionDeRetoma(60), 60);
  assert.equal(posicionDeRetoma(754.5), 754.5);
  assert.equal(posicionDeRetoma(Number.NaN), 0);
});

const base = { ahoraMs: 100_000, ultimoMs: 90_000, posicion: 130, ultimaPosicion: 120, velocidad: 1 };

test('debeGuardar: a los 10 s del último guardado', () => {
  assert.equal(debeGuardar({ ...base, ahoraMs: 100_000, ultimoMs: 90_000 }), true);
  assert.equal(debeGuardar({ ...base, ahoraMs: 99_999, ultimoMs: 90_000 }), false);
});

test('debeGuardar: reproducción normal entre guardados no guarda', () => {
  // 4 s después del último guardado, la posición avanzó 4 s: nada raro.
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 124, ultimaPosicion: 120 }), false);
});

test('debeGuardar: un salto de más de 5 s respecto a lo esperado guarda ya (hacia delante y hacia atrás)', () => {
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 300, ultimaPosicion: 120 }), true);
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 30, ultimaPosicion: 120 }), true);
});

test('debeGuardar: un salto exacto de 5 s no basta; hace falta pasar de 5', () => {
  // esperada = 120 + 4 = 124; posición 129 -> diferencia 5 -> no guarda; 129,5 -> guarda.
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 129, ultimaPosicion: 120 }), false);
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 129.5, ultimaPosicion: 120 }), true);
});

test('debeGuardar: no guarda un salto en menos de 1 s desde el último guardado', () => {
  assert.equal(debeGuardar({ ...base, ahoraMs: 90_500, ultimoMs: 90_000, posicion: 500, ultimaPosicion: 120 }), false);
});

test('debeGuardar: con velocidad 2× la posición esperada avanza el doble', () => {
  // 4 s reales a 2× = 8 s de vídeo: 120 -> 128 es lo normal.
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 128, ultimaPosicion: 120, velocidad: 2 }), false);
  assert.equal(debeGuardar({ ...base, ahoraMs: 94_000, ultimoMs: 90_000, posicion: 128, ultimaPosicion: 120, velocidad: 1 }), false); // 4 s de diferencia: aún no pasa de 5
});

test('debeGuardar: posición cero o no finita nunca guarda', () => {
  assert.equal(debeGuardar({ ...base, posicion: 0 }), false);
  assert.equal(debeGuardar({ ...base, posicion: Number.NaN }), false);
});

test('anterioresDe: los episodios con número menor, ordenados y sin repetidos', () => {
  assert.deepEqual(anterioresDe([1, 2, 3, 4, 5], 4), [1, 2, 3]);
  assert.deepEqual(anterioresDe([5, 3, 1, 3, 2], 4), [1, 2, 3]);
  assert.deepEqual(anterioresDe([1, 2, 12.5, 13], 13), [1, 2, 12.5]);
});

test('anterioresDe: sin anteriores da una lista vacía', () => {
  assert.deepEqual(anterioresDe([1, 2, 3], 1), []);
  assert.deepEqual(anterioresDe([], 5), []);
});

test('anterioresDe: ignora valores no finitos y negativos', () => {
  assert.deepEqual(anterioresDe([Number.NaN, -1, 1, 2], 3), [1, 2]);
});
