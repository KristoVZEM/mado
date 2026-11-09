import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LISTADOS, sinRepetidos, tituloDe } from './listados.ts';

const r = (aid: number) => ({ aid, slug: `s${aid}`, title: `T${aid}` });

test('los listados tienen ids y títulos únicos', () => {
  assert.equal(new Set(LISTADOS.map((l) => l.id)).size, LISTADOS.length);
  assert.equal(new Set(LISTADOS.map((l) => l.titulo)).size, LISTADOS.length);
  assert.equal(tituloDe('populares'), 'Populares');
});

test('sinRepetidos añade lo nuevo al final y descarta lo que ya estaba', () => {
  assert.deepEqual(sinRepetidos([r(1), r(2)], [r(2), r(3)]).map((x) => x.aid), [1, 2, 3]);
  assert.deepEqual(sinRepetidos([], [r(1), r(1)]).map((x) => x.aid), [1], 'tampoco repite dentro de la página nueva');
});
