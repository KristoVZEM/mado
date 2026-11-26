import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generoEnEspanol } from './generos.ts';

test('traduce los 19 géneros de AniList', () => {
  assert.equal(generoEnEspanol('Action'), 'Acción');
  assert.equal(generoEnEspanol('Slice of Life'), 'Recuentos de la vida');
  assert.equal(generoEnEspanol('Sci-Fi'), 'Ciencia ficción');
  assert.equal(generoEnEspanol('Thriller'), 'Suspense');
  assert.equal(generoEnEspanol('Mahou Shoujo'), 'Mahō shōjo');
});

test('un género desconocido se queda tal cual', () => {
  assert.equal(generoEnEspanol('Isekai'), 'Isekai');
});
