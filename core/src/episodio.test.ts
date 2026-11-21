import { test } from 'node:test';
import assert from 'node:assert/strict';
import { episodio, parseEpisodio } from './episodio.ts';
import { FuenteCambio } from './errors.ts';
import type { Http } from './http.ts';

const payload = {
  nodes: [
    null,
    {
      type: 'data',
      data: [
        { episode: 1, embeds: 2 },
        { number: 3, variants: 4 },
        { SUB: 5 },
        1,
        { SUB: 3 },
        [6],
        { server: 7, url: 8 },
        'HLS',
        'https://player.zilla-networks.com/play/abc',
      ],
    },
  ],
};

test('extrae número, variantes y embeds', () => {
  assert.deepEqual(parseEpisodio(payload), {
    number: 1,
    variants: { SUB: 1 },
    embeds: { SUB: [{ server: 'HLS', url: 'https://player.zilla-networks.com/play/abc' }] },
    malId: null,
  });
});

/** Igual que `payload`, con `media: { malId }` colgando de la raíz. */
function conMedia(malId: unknown) {
  return {
    nodes: [
      null,
      {
        type: 'data',
        data: [
          { episode: 1, embeds: 2, media: 9 },
          { number: 3, variants: 4 },
          { SUB: 5 },
          1,
          { SUB: 3 },
          [6],
          { server: 7, url: 8 },
          'HLS',
          'https://player.zilla-networks.com/play/abc',
          { malId: 10 },
          malId,
        ],
      },
    ],
  };
}

test('lee media.malId cuando es un entero positivo', () => {
  assert.equal(parseEpisodio(conMedia(1535)).malId, 1535);
});

test('un malId que no sea un entero >= 1 queda en null, sin lanzar', () => {
  for (const malo of [0, -3, 12.5, '1535', null, Number.NaN]) {
    assert.equal(parseEpisodio(conMedia(malo)).malId, null, String(malo));
  }
});

test('lanza FuenteCambio si faltan los embeds o el episodio', () => {
  const sinEmbeds = { nodes: [null, { type: 'data', data: [{ episode: 1 }, { number: 2 }, 1] }] };
  assert.throws(() => parseEpisodio(sinEmbeds), FuenteCambio);
  const sinEpisodio = { nodes: [null, { type: 'data', data: [{ embeds: 1 }, {}] }] };
  assert.throws(() => parseEpisodio(sinEpisodio), FuenteCambio);
});

test('lanza FuenteCambio si un embed no trae server y url', () => {
  const malo = {
    nodes: [null, { type: 'data', data: [{ episode: 1, embeds: 2 }, { number: 3 }, { SUB: 4 }, 1, [5], { server: 6 }, 'HLS'] }],
  };
  assert.throws(() => parseEpisodio(malo), FuenteCambio);
});

test('episodio pide el episodio por slug y número', async () => {
  let pedida = '';
  const http: Http = {
    userAgent: 'UA',
    get: async (url) => {
      pedida = url;
      return new Response(JSON.stringify(payload));
    },
  };
  const e = await episodio(http, 'one-piece', 1);
  assert.equal(pedida, 'https://animeav1.com/media/one-piece/1/__data.json');
  assert.equal(e.number, 1);
});
