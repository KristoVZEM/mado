import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_TRAMO_S, MIN_TRAMO_S, TOLERANCIA_CORTE_S, validarIntro } from './validar.ts';

const op = (inicio: number, fin: number, largo: number, extra: Record<string, unknown> = {}) => ({
  skipType: 'op',
  skipId: 'no-se-usa',
  interval: { startTime: inicio, endTime: fin },
  episodeLength: largo,
  ...extra,
});
const respuesta = (...results: unknown[]) => ({ statusCode: 200, message: 'x', found: true, results });

test('los límites que usa el resto del código', () => {
  assert.deepEqual([MIN_TRAMO_S, MAX_TRAMO_S, TOLERANCIA_CORTE_S], [5, 300, 3]);
});

test('acepta un opening normal del mismo corte', () => {
  assert.deepEqual(validarIntro(respuesta(op(1, 91, 1377)), 1377.4), { inicio: 1, fin: 91 });
});

test('ignora ending, recap y mixtos', () => {
  const r = respuesta(
    op(1280, 1370, 1377, { skipType: 'ed' }),
    op(10, 100, 1377, { skipType: 'recap' }),
    op(10, 100, 1377, { skipType: 'mixed-op' }),
  );
  assert.equal(validarIntro(r, 1377), null);
});

test('descarta valores absurdos', () => {
  const duracion = 1400;
  const malos = [
    op(Number.NaN, 90, 1400),
    op(10, Number.POSITIVE_INFINITY, 1400),
    op(-5, 85, 1400),
    op(90, 10, 1400), // fin antes que inicio
    op(50, 50, 1400), // vacío
    op(10, 1500, 1400), // se sale del episodio
    op(10, 12, 1400), // demasiado corto
    op(10, 400, 1400), // demasiado largo
    op('10' as unknown as number, '100' as unknown as number, 1400), // no son números
    { skipType: 'op', interval: { startTime: 10, endTime: 100 } }, // sin episodeLength
    { skipType: 'op', episodeLength: 1400 }, // sin intervalo
    null,
    'basura',
  ];
  for (const m of malos) assert.equal(validarIntro(respuesta(m), duracion), null, JSON.stringify(m));
});

test('descarta los envíos de otro corte del vídeo', () => {
  assert.equal(validarIntro(respuesta(op(47, 137, 1540)), 1447), null);
  assert.deepEqual(validarIntro(respuesta(op(47, 137, 1449)), 1447), { inicio: 47, fin: 137 });
});

test('con varios válidos elige el de duración más cercana, y el primero en empate', () => {
  const r = respuesta(op(10, 100, 1436), op(20, 110, 1435), op(30, 120, 1435));
  assert.deepEqual(validarIntro(r, 1435.2), { inicio: 20, fin: 110 });
});

test('una respuesta sin lista de resultados da null', () => {
  for (const r of [null, undefined, {}, { results: 'x' }, { results: [] }, 42]) {
    assert.equal(validarIntro(r, 1400), null);
  }
});

test('una duración no válida da null', () => {
  for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(validarIntro(respuesta(op(1, 91, 1377)), d), null);
  }
});
