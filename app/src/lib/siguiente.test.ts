import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISO_SIGUIENTE_S,
  DURACION_MINIMA_S,
  SALTO_SIGUIENTE_S,
  estadoSiguiente,
} from './siguiente.ts';

const DURACION = 1400; // un episodio de ~23 min

test('las constantes son 20 s de aviso, salto 2 s antes del final y mínimo de 60 s', () => {
  assert.equal(AVISO_SIGUIENTE_S, 20);
  assert.equal(SALTO_SIGUIENTE_S, 2);
  assert.equal(DURACION_MINIMA_S, 60);
});

test('no aparece fuera de los últimos 20 s', () => {
  assert.deepEqual(estadoSiguiente(0, DURACION), { visible: false, progreso: 0, saltar: false });
  assert.equal(estadoSiguiente(DURACION - 21, DURACION).visible, false);
});

test('aparece vacío a 20 s del final y se llena hasta 2 s antes', () => {
  assert.deepEqual(estadoSiguiente(DURACION - 20, DURACION), { visible: true, progreso: 0, saltar: false });
  const mitad = estadoSiguiente(DURACION - 11, DURACION);
  assert.equal(mitad.visible, true);
  assert.equal(mitad.progreso, 0.5);
  assert.equal(mitad.saltar, false);
});

test('salta a 2 s del final, con el relleno completo', () => {
  assert.deepEqual(estadoSiguiente(DURACION - 2, DURACION), { visible: true, progreso: 1, saltar: true });
  assert.equal(estadoSiguiente(DURACION - 0.5, DURACION).saltar, true);
});

test('sin duración conocida o en vídeos muy cortos no hace nada', () => {
  assert.equal(estadoSiguiente(10, 0).visible, false);
  assert.equal(estadoSiguiente(10, Number.NaN).visible, false);
  assert.equal(estadoSiguiente(50, 59).visible, false);
});

test('una posición fuera de rango no rompe nada', () => {
  assert.equal(estadoSiguiente(-5, DURACION).visible, false);
  assert.equal(estadoSiguiente(DURACION + 30, DURACION).saltar, true);
  assert.equal(estadoSiguiente(Number.NaN, DURACION).visible, false);
});
