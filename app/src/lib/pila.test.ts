import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPE_PILA, pilaAlAbrir, pilaAlVolver, type Abierto } from './pila.ts';

const ficha = (aid: number): Abierto => ({ tipo: 'ficha', anime: { aid } });
const video = (aid: number): Abierto => ({ tipo: 'reproducir', anime: { aid } });

test('abrir la ficha de otra serie desde una ficha apila la anterior', () => {
  assert.deepEqual(pilaAlAbrir([], ficha(1), ficha(2)), [ficha(1)]);
  assert.deepEqual(pilaAlAbrir([ficha(1)], ficha(2), ficha(3)), [ficha(1), ficha(2)]);
});

test('abrir una ficha desde una sección no apila nada', () => {
  assert.deepEqual(pilaAlAbrir([], null, ficha(1)), []);
});

test('entrar al reproductor y volver de él no tocan la pila', () => {
  const pila = [ficha(1)];
  assert.deepEqual(pilaAlAbrir(pila, ficha(2), video(2)), pila);
  assert.deepEqual(pilaAlAbrir(pila, video(2), ficha(2)), pila);
  assert.deepEqual(pilaAlAbrir(pila, video(2), video(2)), pila);
});

test('reabrir la misma ficha no la apila', () => {
  assert.deepEqual(pilaAlAbrir([], ficha(1), ficha(1)), []);
});

test('la pila olvida lo más antiguo al pasar el tope', () => {
  let pila: Abierto[] = [];
  for (let i = 1; i <= TOPE_PILA + 5; i++) pila = pilaAlAbrir(pila, ficha(i), ficha(i + 1));
  assert.equal(pila.length, TOPE_PILA);
  assert.deepEqual(pila[0], ficha(6));
  assert.deepEqual(pila.at(-1), ficha(TOPE_PILA + 5));
});

test('volver saca la última ficha; sin ninguna, va a la sección', () => {
  assert.deepEqual(pilaAlVolver([ficha(1), ficha(2)]), { pila: [ficha(1)], destino: ficha(2) });
  assert.deepEqual(pilaAlVolver([]), { pila: [], destino: null });
});

test('ninguna de las dos modifica la pila que recibe', () => {
  const pila = [ficha(1)];
  pilaAlAbrir(pila, ficha(2), ficha(3));
  pilaAlVolver(pila);
  assert.deepEqual(pila, [ficha(1)]);
});
