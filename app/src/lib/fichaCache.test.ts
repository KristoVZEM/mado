import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fichaDeCache } from './fichaCache.ts';

const buena = {
  title: 'Death Note',
  episodes: [
    { id: 1, number: 1 },
    { id: 2, number: 2 },
  ],
  synopsis: 'Un cuaderno.',
  genres: ['Suspenso'],
  status: 'Finalizado',
  anio: 2006,
};

test('una ficha guardada vuelve tal cual', () => {
  assert.deepEqual(fichaDeCache(JSON.stringify(buena)), buena);
});

test('los campos decorativos que falten toman su valor vacío, pero título y episodios son obligatorios', () => {
  assert.deepEqual(fichaDeCache(JSON.stringify({ title: 'X', episodes: [] })), {
    title: 'X',
    episodes: [],
    synopsis: '',
    genres: [],
    status: '',
    anio: null,
  });
  assert.equal(fichaDeCache(JSON.stringify({ episodes: [] })), null);
  assert.equal(fichaDeCache(JSON.stringify({ title: 'X' })), null);
});

test('lo que no es JSON de una ficha se ignora', () => {
  for (const malo of ['', 'no es json', '[]', '42', 'null', '"texto"', '{"roto":']) assert.equal(fichaDeCache(malo), null, malo);
  assert.equal(fichaDeCache(null), null);
  assert.equal(fichaDeCache(undefined), null);
});

test('un episodio mal formado invalida la ficha entera, no se arregla a medias', () => {
  const malos = [
    { id: 1 },
    { number: 1 },
    { id: '1', number: 1 },
    { id: 1, number: Number.POSITIVE_INFINITY },
    { id: 1, number: null },
    null,
    'x',
  ];
  for (const e of malos) {
    assert.equal(fichaDeCache(JSON.stringify({ ...buena, episodes: [e] })), null, JSON.stringify(e));
  }
});

test('los tipos equivocados en los campos decorativos se descartan sin invalidar la ficha', () => {
  const f = fichaDeCache(JSON.stringify({ ...buena, synopsis: 5, genres: 'no', status: null, anio: 'x' }));
  assert.deepEqual(f, { ...buena, synopsis: '', genres: [], status: '', anio: null });
});

test('en los géneros solo valen los textos', () => {
  const f = fichaDeCache(JSON.stringify({ ...buena, genres: ['A', 3, null, 'B'] }));
  assert.deepEqual(f?.genres, ['A', 'B']);
});

test('una lista de episodios absurdamente larga no se acepta', () => {
  const episodes = Array.from({ length: 20_001 }, (_, i) => ({ id: i, number: i }));
  assert.equal(fichaDeCache(JSON.stringify({ ...buena, episodes })), null);
});

test('un año fuera de rango queda en null', () => {
  assert.equal(fichaDeCache(JSON.stringify({ ...buena, anio: 1500 }))?.anio, null);
  assert.equal(fichaDeCache(JSON.stringify({ ...buena, anio: 2100 }))?.anio, 2100);
});
