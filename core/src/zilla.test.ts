import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FuenteCambio, SinRed } from './errors.ts';
import type { Http } from './http.ts';
import { crearResolverZilla, resolverZilla, ZILLA_HEADERS } from './zilla.ts';

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
  assert.equal(resolverZilla({ server: 'Otro', url: 'https://otro.test/e/abc' }, 'UA'), null);
});

test('no resuelve URLs que no son del host exacto o no terminan limpio en el ID', () => {
  const malas = [
    `https://player.zilla-networks.com.evil.com/play/${ID}`,
    `https://player.zilla-networks.com@evil.com/play/${ID}`,
    `http://player.zilla-networks.com/play/${ID}`,
    'https://player.zilla-networks.com/play/',
    'https://player.zilla-networks.com/play/abc123ZZZ',
    'https://player.zilla-networks.com/play/a1b2Zq9',
  ];
  for (const url of malas) assert.equal(resolverZilla({ server: 'HLS', url }, 'UA'), null, url);
});

test('acepta el ID seguido de query o de barra', () => {
  for (const sufijo of ['?x=1', '/', '#f']) {
    const p = resolverZilla({ server: 'HLS', url: `https://player.zilla-networks.com/play/${ID}${sufijo}` }, 'UA');
    assert.equal(p?.url, `https://player.zilla-networks.com/m3u8/${ID}`, sufijo);
  }
});

function httpZilla(respuesta: () => Response | Promise<Response>, vistas: { url: string; headers?: unknown }[] = []): Http {
  return {
    userAgent: 'UA',
    get: async (url, init) => {
      vistas.push({ url, headers: init?.headers });
      return respuesta();
    },
  };
}

const EMBED = { server: 'HLS', url: `https://player.zilla-networks.com/play/${ID}` };

test('crearResolverZilla pide la lista con las cabeceras de Zilla y devuelve el Playable', async () => {
  const vistas: { url: string; headers?: unknown }[] = [];
  const r = crearResolverZilla(httpZilla(() => new Response('#EXTM3U\n#EXT-X-VERSION:3\n'), vistas));
  const p = await r(EMBED, 'UA-test');
  assert.equal(p?.url, `https://player.zilla-networks.com/m3u8/${ID}`);
  assert.deepEqual(vistas, [{ url: `https://player.zilla-networks.com/m3u8/${ID}`, headers: ZILLA_HEADERS }]);
});

test('crearResolverZilla no toca la red con URLs que no son de Zilla', async () => {
  const vistas: { url: string }[] = [];
  const r = crearResolverZilla(httpZilla(() => new Response('#EXTM3U'), vistas));
  assert.equal(await r({ server: 'Otro', url: 'https://otro.test/e/abc' }, 'UA'), null);
  assert.equal(vistas.length, 0);
});

test('crearResolverZilla: 403/404 o una respuesta que no es HLS cuentan como FuenteCambio', async () => {
  for (const res of [
    () => new Response('no', { status: 403 }),
    () => new Response('no', { status: 404 }),
    () => new Response('<html>bloqueado</html>'),
    () => new Response(''),
  ]) {
    const r = crearResolverZilla(httpZilla(res));
    await assert.rejects(r(EMBED, 'UA'), FuenteCambio);
  }
});

test('crearResolverZilla deja subir los fallos de red tal cual', async () => {
  const r = crearResolverZilla(httpZilla(() => Promise.reject(new SinRed('sin red'))));
  await assert.rejects(r(EMBED, 'UA'), SinRed);
});
