import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverZilla, ZILLA_HEADERS } from './zilla.ts';

const ID = '7601658844858539e438dceee32e7924';

test('cambia /play/ por /m3u8/, añade las cabeceras y el user-agent', () => {
  const p = resolverZilla({ server: 'HLS', url: `https://player.zilla-networks.com/play/${ID}` }, 'UA-test');
  assert.deepEqual(p, {
    url: `https://player.zilla-networks.com/m3u8/${ID}`,
    headers: ZILLA_HEADERS,
    userAgent: 'UA-test',
  });
});

test('ZILLA_HEADERS fija las cabeceras descubiertas el 2026-11-02', () => {
  assert.deepEqual(ZILLA_HEADERS, {
    referer: 'https://player.zilla-networks.com/',
    origin: 'https://player.zilla-networks.com',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
  });
});

test('el Playable no comparte el objeto de cabeceras con la constante', () => {
  const p = resolverZilla({ server: 'HLS', url: `https://player.zilla-networks.com/play/${ID}` }, 'UA');
  assert.notEqual(p?.headers, ZILLA_HEADERS);
});

test('ignora otras URLs', () => {
  assert.equal(resolverZilla({ server: 'Voe', url: 'https://voe.sx/e/abc' }, 'UA'), null);
});
