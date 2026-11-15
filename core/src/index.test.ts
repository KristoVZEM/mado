import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearFuentes, SinRed, SinServidor } from './index.ts';
import type { Http } from './index.ts';

const busqueda = {
  nodes: [
    null,
    {
      type: 'data',
      data: [{ results: 1 }, [2], { id: 3, title: 4, slug: 5 }, '21', 'One Piece', 'one-piece'],
    },
  ],
};

const episodioPayload = {
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

function httpFalso(rutas: Record<string, unknown>): Http {
  return {
    userAgent: 'UA-test',
    get: async (url) => {
      if (url === 'https://player.zilla-networks.com/m3u8/abc') return new Response('#EXTM3U\n');
      for (const [fragmento, payload] of Object.entries(rutas)) {
        if (url.includes(fragmento)) return new Response(JSON.stringify(payload));
      }
      return new Response('no', { status: 404 });
    },
  };
}

test('buscar delega en el catálogo', async () => {
  const f = crearFuentes({ http: httpFalso({ '/catalogo/': busqueda }) });
  assert.deepEqual(await f.buscar('one piece'), [{ aid: 21, title: 'One Piece', slug: 'one-piece' }]);
});

test('resolver devuelve el Playable de Zilla con el user-agent del cliente', async () => {
  const f = crearFuentes({ http: httpFalso({ '/media/one-piece/1/__data.json': episodioPayload }) });
  const p = await f.resolver('one-piece', 1, 'SUB');
  assert.equal(p.url, 'https://player.zilla-networks.com/m3u8/abc');
  assert.equal(p.userAgent, 'UA-test');
  assert.equal(p.headers.referer, 'https://player.zilla-networks.com/');
});

test('resolver lanza SinServidor si el idioma pedido no tiene embeds', async () => {
  const f = crearFuentes({ http: httpFalso({ '/media/one-piece/1/__data.json': episodioPayload }) });
  await assert.rejects(f.resolver('one-piece', 1, 'DUB'), SinServidor);
});

test('acepta resolutores propios, en orden de prioridad', async () => {
  const propio = () => ({ url: 'https://propio.test/v', headers: {}, userAgent: 'UA', calidad: 720 });
  const f = crearFuentes({
    http: httpFalso({ '/media/one-piece/1/__data.json': episodioPayload }),
    resolvers: [propio],
  });
  assert.equal((await f.resolver('one-piece', 1)).calidad, 720);
});

// Arma un payload de episodio con los embeds dados (tabla devalue calculada, no a mano).
function payloadEpisodio(embeds: { server: string; url: string }[]) {
  const n = embeds.length;
  const tabla: unknown[] = [{ episode: 1, embeds: 2 }, { number: 3, variants: 4 }, { SUB: 5 }, 1, { SUB: 3 }];
  tabla.push(Array.from({ length: n }, (_, i) => 6 + i));
  embeds.forEach((_, i) => tabla.push({ server: 6 + n + 2 * i, url: 7 + n + 2 * i }));
  embeds.forEach((e) => tabla.push(e.server, e.url));
  return { nodes: [null, { type: 'data', data: tabla }] };
}

const ZILLA = { server: 'HLS', url: 'https://player.zilla-networks.com/play/abc' };
const MP4 = { server: 'MP4Upload', url: 'https://www.mp4upload.com/embed-abc123.html' };
// Cliente falso que sirve la ficha del episodio y la lista HLS de Zilla.
function httpConEmbeds(embeds: { server: string; url: string }[]): Http {
  return {
    userAgent: 'UA-test',
    get: async (url) => {
      if (url === 'https://player.zilla-networks.com/m3u8/abc') return new Response('#EXTM3U\n');
      if (url.includes('/media/one-piece/1/__data.json')) return new Response(JSON.stringify(payloadEpisodio(embeds)));
      return new Response('no', { status: 404 });
    },
  };
}

test('la cadena por defecto prefiere Zilla sobre MP4Upload y marca el servidor', async () => {
  const f = crearFuentes({ http: httpConEmbeds([MP4, ZILLA]), capturarStream: async () => 'https://mp4.test/v.mp4' });
  const p = await f.resolver('one-piece', 1);
  assert.equal(p.servidor, 'HLS');
  assert.equal(p.url, 'https://player.zilla-networks.com/m3u8/abc');
});

test('sin Zilla, usa MP4Upload cuando hay capturarStream', async () => {
  const f = crearFuentes({ http: httpConEmbeds([MP4]), capturarStream: async () => 'https://mp4.test/v.mp4' });
  const p = await f.resolver('one-piece', 1);
  assert.equal(p.servidor, 'MP4Upload');
  assert.equal(p.url, 'https://mp4.test/v.mp4');
  assert.equal(p.headers.referer, 'https://www.mp4upload.com/');
});

test('sin capturarStream, MP4Upload no entra en la cadena y no queda ningún servidor', async () => {
  const f = crearFuentes({ http: httpConEmbeds([MP4]) });
  await assert.rejects(f.resolver('one-piece', 1), SinServidor);
});

test('si ningún servidor sirve, SinServidor explica por qué falló cada uno', async () => {
  const f = crearFuentes({
    http: httpConEmbeds([MP4]),
    capturarStream: async () => {
      throw 'sin captura válida (timeout)';
    },
  });
  await assert.rejects(f.resolver('one-piece', 1), (e: unknown) => {
    assert.ok(e instanceof SinServidor);
    assert.equal(e.causas.length, 1);
    assert.ok(e.causas[0] instanceof SinRed);
    return true;
  });
});

test('si Zilla no responde una lista HLS, la cadena pasa a MP4Upload', async () => {
  const base = httpConEmbeds([ZILLA, MP4]);
  const http: Http = {
    userAgent: 'UA-test',
    get: async (url, init) =>
      url.startsWith('https://player.zilla-networks.com/') ? new Response('no', { status: 403 }) : base.get(url, init),
  };
  const f = crearFuentes({ http, capturarStream: async () => 'https://mp4.test/v.mp4' });
  const p = await f.resolver('one-piece', 1);
  assert.equal(p.servidor, 'MP4Upload');
});

test('servidores lista los servidores del episodio en ese idioma, sin repetir', async () => {
  const f = crearFuentes({ http: httpFalso({ '/media/one-piece/1/__data.json': episodioPayload }) });
  assert.deepEqual(await f.servidores('one-piece', 1, 'SUB'), ['HLS']);
  assert.deepEqual(await f.servidores('one-piece', 1, 'DUB'), []);
});
