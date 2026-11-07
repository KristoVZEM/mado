import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearFuentes, SinServidor } from './index.ts';
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
