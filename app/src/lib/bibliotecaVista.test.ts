import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntradaBiblioteca } from './datos.ts';
import { ev } from '../pruebas/entradas.ts';
import { fraccion, ordenar, ordenDe, valorDeOrden } from './bibliotecaVista.ts';

const titulos = (l: readonly EntradaBiblioteca[]) => l.map((x) => x.titulo);

test('ordenDe lee el número guardado y cae en «último visto» si no vale', () => {
  assert.equal(ordenDe('0'), 'ultimo');
  assert.equal(ordenDe('1'), 'progreso');
  assert.equal(ordenDe('2'), 'puntuacion');
  assert.equal(ordenDe('3'), 'titulo');
  for (const malo of [null, '', '4', '-1', '1.5', 'titulo']) assert.equal(ordenDe(malo), 'ultimo', String(malo));
});

test('valorDeOrden es el inverso de ordenDe', () => {
  for (const o of ['ultimo', 'progreso', 'puntuacion', 'titulo'] as const) assert.equal(ordenDe(valorDeOrden(o)), o);
});

test('fraccion: vistos sobre total, con tope 1; null sin total o sin vistos', () => {
  assert.equal(fraccion(ev(1, 'a', { vistos: 3, total: 12 })), 0.25);
  assert.equal(fraccion(ev(1, 'a', { vistos: 15, total: 12 })), 1);
  assert.equal(fraccion(ev(1, 'a', { vistos: 0, total: 12 })), null);
  assert.equal(fraccion(ev(1, 'a', { vistos: 3, total: null })), null);
});

test('último visto: lo más reciente primero, sin actividad al final por título', () => {
  const l = [ev(1, 'Bleach'), ev(2, 'Akira', { vistoEn: 10 }), ev(3, 'Naruto', { vistoEn: 30 }), ev(4, 'Añil')];
  assert.deepEqual(titulos(ordenar(l, 'ultimo')), ['Naruto', 'Akira', 'Añil', 'Bleach']);
});

test('progreso: casi terminadas primero; sin dato al final', () => {
  const l = [
    ev(1, 'Sin total', { vistos: 5 }),
    ev(2, 'Mitad', { vistos: 6, total: 12 }),
    ev(3, 'Casi', { vistos: 11, total: 12 }),
    ev(4, 'Empate A', { vistos: 6, total: 12 }),
  ];
  assert.deepEqual(titulos(ordenar(l, 'progreso')), ['Casi', 'Empate A', 'Mitad', 'Sin total']);
});

test('puntuación: la mejor primero; sin nota al final', () => {
  const l = [ev(1, 'C', { puntuacion: null }), ev(2, 'B', { puntuacion: 70 }), ev(3, 'A', { puntuacion: 91 })];
  assert.deepEqual(titulos(ordenar(l, 'puntuacion')), ['A', 'B', 'C']);
});

test('título: A-Z en español (la Ñ tras la N, tildes con su letra) y no muta la lista', () => {
  const l = [ev(1, 'Ñandú'), ev(2, 'Élite'), ev(3, 'Naruto'), ev(4, 'akira')];
  const copia = [...l];
  assert.deepEqual(titulos(ordenar(l, 'titulo')), ['akira', 'Élite', 'Naruto', 'Ñandú']);
  assert.deepEqual(l, copia);
});
