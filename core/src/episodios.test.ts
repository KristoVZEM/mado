import { test } from 'node:test';
import assert from 'node:assert/strict';
import { episodios, parseEpisodios } from './episodios.ts';
import { FuenteCambio } from './errors.ts';
import type { Http } from './http.ts';

const payload = {
  nodes: [
    null,
    {
      type: 'data',
      data: [
        { media: 1 },
        { episodes: 2, title: 5 },
        [3, 4],
        { id: 6, number: 7 },
        { id: 8, number: 9 },
        'One Piece',
        101,
        1,
        102,
        2,
      ],
    },
  ],
};

test('extrae el título y los episodios con id y número', () => {
  assert.deepEqual(parseEpisodios(payload), {
    title: 'One Piece',
    episodes: [
      { id: 101, number: 1 },
      { id: 102, number: 2 },
    ],
    synopsis: '',
    genres: [],
    status: '',
  });
});

const payloadConDetalle = {
  nodes: [
    null,
    {
      type: 'data',
      data: [
        { media: 1 },
        { episodes: 2, title: 4, synopsis: 5, genres: 6, status: 7 },
        [3],
        { id: 8, number: 9 },
        'One Piece',
        '  Un pirata busca el tesoro.  ',
        [10, 11],
        'Emitiéndose',
        101,
        1,
        'Aventura',
        'Acción',
      ],
    },
  ],
};

test('extrae sinopsis, géneros y estado cuando vienen', () => {
  const f = parseEpisodios(payloadConDetalle);
  assert.equal(f.synopsis, 'Un pirata busca el tesoro.');
  assert.deepEqual(f.genres, ['Aventura', 'Acción']);
  assert.equal(f.status, 'Emitiéndose');
});

test('géneros como objetos con name y valores raros no rompen la ficha', () => {
  const raro = {
    nodes: [
      null,
      {
        type: 'data',
        data: [{ media: 1 }, { episodes: 2, title: 4, synopsis: 5, genres: 6, status: 5 }, [], 3, 'X', 42, [7, 8, 9], { name: 10 }, 99, null, 'Drama'],
      },
    ],
  };
  const f = parseEpisodios(raro);
  assert.equal(f.synopsis, '');
  assert.equal(f.status, '');
  assert.deepEqual(f.genres, ['Drama']);
});

test('lanza FuenteCambio si falta media o episodes', () => {
  const sinMedia = { nodes: [null, { type: 'data', data: [{ otra: 1 }, 'x'] }] };
  assert.throws(() => parseEpisodios(sinMedia), FuenteCambio);
  const sinEpisodes = { nodes: [null, { type: 'data', data: [{ media: 1 }, { title: 2 }, 'X'] }] };
  assert.throws(() => parseEpisodios(sinEpisodes), FuenteCambio);
});

test('lanza FuenteCambio si un episodio no trae id y número numéricos', () => {
  const malo = {
    nodes: [null, { type: 'data', data: [{ media: 1 }, { episodes: 2, title: 4 }, [3], { id: 5 }, 'X', 7] }],
  };
  assert.throws(() => parseEpisodios(malo), FuenteCambio);
});

test('episodios pide la ficha por slug', async () => {
  let pedida = '';
  const http: Http = {
    userAgent: 'UA',
    get: async (url) => {
      pedida = url;
      return new Response(JSON.stringify(payload));
    },
  };
  const ficha = await episodios(http, 'one-piece');
  assert.equal(pedida, 'https://animeav1.com/media/one-piece/__data.json');
  assert.equal(ficha.episodes.length, 2);
});

test('lanza FuenteCambio si el número del episodio es NaN', () => {
  const nan = {
    nodes: [null, { type: 'data', data: [{ media: 1 }, { episodes: 2, title: 4 }, [3], { id: 5, number: -3 }, 'X', 101] }],
  };
  assert.throws(() => parseEpisodios(nan), FuenteCambio);
});
