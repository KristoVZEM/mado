import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buscar, parseBusqueda } from './busqueda.ts';
import { FuenteCambio } from './errors.ts';
import type { Http } from './http.ts';

const payload = {
  nodes: [
    null,
    { type: 'data', data: [{ user: 1 }, null] },
    {
      type: 'data',
      data: [
        { results: 1 },
        [2, 3],
        { id: 4, title: 5, slug: 6 },
        { id: 7, title: 8, slug: 9 },
        '21',
        'One Piece',
        'one-piece',
        '1735',
        'Naruto',
        'naruto',
      ],
    },
  ],
};

test('extrae aid, título y slug de cada resultado', () => {
  assert.deepEqual(parseBusqueda(payload), [
    { aid: 21, title: 'One Piece', slug: 'one-piece' },
    { aid: 1735, title: 'Naruto', slug: 'naruto' },
  ]);
});

test('lanza FuenteCambio si no hay results', () => {
  const sinResults = { nodes: [null, { type: 'data', data: [{ otra: 1 }, 'x'] }] };
  assert.throws(() => parseBusqueda(sinResults), FuenteCambio);
});

test('lanza FuenteCambio si un resultado no trae slug o id numérico', () => {
  const malo = { nodes: [null, { type: 'data', data: [{ results: 1 }, [2], { id: 3, title: 4 }, '21', 'X'] }] };
  assert.throws(() => parseBusqueda(malo), FuenteCambio);
  const sinId = { nodes: [null, { type: 'data', data: [{ results: 1 }, [2], { id: 3, title: 4, slug: 5 }, 'abc', 'X', 'x'] }] };
  assert.throws(() => parseBusqueda(sinId), FuenteCambio);
});

test('buscar pide el catálogo con el texto codificado', async () => {
  let pedida = '';
  const http: Http = {
    userAgent: 'UA',
    get: async (url) => {
      pedida = url;
      return new Response(JSON.stringify(payload));
    },
  };
  const r = await buscar(http, 'one piece');
  assert.equal(pedida, 'https://animeav1.com/catalogo/__data.json?search=one%20piece');
  assert.equal(r.length, 2);
});
