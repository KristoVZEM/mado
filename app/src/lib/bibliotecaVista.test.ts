import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Biblioteca, EntradaBiblioteca } from './datos.ts';
import { ev } from '../pruebas/entradas.ts';
import {
  aplicarFiltros,
  dePestana,
  fraccion,
  generosOfrecidos,
  hayFiltros,
  ordenar,
  ordenDe,
  recuentosVista,
  SIN_FILTROS,
  unir,
  valorDeOrden,
  type EntradaVista,
} from './bibliotecaVista.ts';

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

const b: Biblioteca = {
  siguiendo: [ev(1, 'One Piece', { estado: 1 }), ev(2, 'Naruto', { estado: 3 }), ev(3, 'Akira', { estado: 1 })],
  favoritos: [ev(2, 'Naruto', { estado: 3 }), ev(4, 'Bleach', { estado: null })],
};

test('unir: lo seguido con su marca de favorito y los favoritos sin estado', () => {
  const u = unir(b);
  assert.deepEqual(u.map((x) => [x.aid, x.favorito, x.estado]), [[1, false, 1], [2, true, 3], [3, false, 1], [4, true, null]]);
});

test('dePestana y recuentosVista: Todas incluye los favoritos sin estado', () => {
  const u = unir(b);
  assert.deepEqual(dePestana(u, 'todos').map((x) => x.aid), [1, 2, 3, 4]);
  assert.deepEqual(dePestana(u, 'viendo').map((x) => x.aid), [1, 3]);
  assert.deepEqual(recuentosVista(u), { todos: 4, viendo: 2, considerando: 0, completado: 1, dropeado: 0, pausado: 0 });
});

test('hayFiltros', () => {
  assert.equal(hayFiltros(SIN_FILTROS), false);
  assert.equal(hayFiltros({ ...SIN_FILTROS, texto: '   ' }), false);
  assert.equal(hayFiltros({ ...SIN_FILTROS, texto: 'a' }), true);
  assert.equal(hayFiltros({ ...SIN_FILTROS, soloFavoritos: true }), true);
  assert.equal(hayFiltros({ ...SIN_FILTROS, genero: 'Action' }), true);
});

test('aplicarFiltros: texto sin tildes, favoritos, nuevos y género se combinan con Y', () => {
  const l = [
    ev(1, 'Shingeki no Kyojin', { favorito: true, generos: ['Action', 'Drama'] }),
    ev(2, 'Kimetsu no Yaiba', { generos: ['Action'] }),
    ev(3, 'Pokémon', { favorito: true, generos: [] }),
  ];
  const nuevo = (e: EntradaVista) => e.aid === 2;
  const ids = (f: Partial<typeof SIN_FILTROS>) => aplicarFiltros(l, { ...SIN_FILTROS, ...f }, nuevo).map((x) => x.aid);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ texto: 'pokemon' }), [3]);
  assert.deepEqual(ids({ texto: 'p' }), [3]); // una letra ya filtra
  assert.deepEqual(ids({ texto: 'no' }), [1, 2]);
  assert.deepEqual(ids({ soloFavoritos: true }), [1, 3]);
  assert.deepEqual(ids({ soloNuevos: true }), [2]);
  assert.deepEqual(ids({ genero: 'Action' }), [1, 2]);
  assert.deepEqual(ids({ genero: 'Action', soloFavoritos: true }), [1]);
});

test('generosOfrecidos: únicos, traducidos y ordenados en español', () => {
  const l = [ev(1, 'a', { generos: ['Sci-Fi', 'Action'] }), ev(2, 'b', { generos: ['Action', 'Isekai'] }), ev(3, 'c')];
  assert.deepEqual(generosOfrecidos(l), [
    { valor: 'Action', nombre: 'Acción' },
    { valor: 'Sci-Fi', nombre: 'Ciencia ficción' },
    { valor: 'Isekai', nombre: 'Isekai' },
  ]);
  assert.deepEqual(generosOfrecidos([ev(1, 'a')]), []);
});
