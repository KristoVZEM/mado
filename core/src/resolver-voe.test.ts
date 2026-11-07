import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearResolverVoe } from './resolver-voe.ts';
import { Desafio, FuenteCambio } from './errors.ts';
import type { Http } from './http.ts';
import { paginaRedireccionVoe, paginaVoe } from './voe.testutil.ts';

const EMBED = { server: 'Voe', url: 'https://voe.sx/e/abc123' };
const DESTINO = 'https://espejo.test/e/abc123';
const MASTER = 'https://cdn.test/engine/master.m3u8?t=tok&e=14400';
const M3U8 =
  '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\na.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1280x720\nb.m3u8\n';

function httpFalso(rutas: Record<string, () => Response>) {
  const pedidas: string[] = [];
  const http: Http = {
    userAgent: 'UA-test',
    get: async (url) => {
      pedidas.push(url);
      const ruta = rutas[url];
      return ruta ? ruta() : new Response('no', { status: 404 });
    },
  };
  return { http, pedidas };
}

function rutasFelices(): Record<string, () => Response> {
  return {
    [EMBED.url]: () => new Response(paginaRedireccionVoe(DESTINO)),
    [DESTINO]: () => new Response(paginaVoe({ source: MASTER, title: 'x' })),
    [MASTER]: () => new Response(M3U8),
  };
}

test('resuelve el embed: master.m3u8 sin cabeceras, user-agent del cliente y calidad máxima', async () => {
  const { http, pedidas } = httpFalso(rutasFelices());
  const p = await crearResolverVoe(http)(EMBED, 'UA-test');
  assert.deepEqual(p, { url: MASTER, headers: {}, userAgent: 'UA-test', calidad: 720 });
  assert.deepEqual(pedidas, [EMBED.url, DESTINO, MASTER]);
});

test('la calidad queda sin definir si el master no se puede leer', async () => {
  const rutas = rutasFelices();
  rutas[MASTER] = () => new Response('no', { status: 404 });
  const p = await crearResolverVoe(httpFalso(rutas).http)(EMBED, 'UA');
  assert.equal(p?.url, MASTER);
  assert.equal(p?.calidad, undefined);
});

test('ignora los embeds que no son de voe.sx sin hacer peticiones', async () => {
  const { http, pedidas } = httpFalso(rutasFelices());
  const resolver = crearResolverVoe(http);
  assert.equal(await resolver({ server: 'X', url: 'https://otro.test/e/abc' }, 'UA'), null);
  assert.equal(await resolver({ server: 'X', url: 'https://voe.sx.evil.test/e/abc' }, 'UA'), null);
  assert.equal(await resolver({ server: 'X', url: 'http://voe.sx/e/abc' }, 'UA'), null);
  assert.deepEqual(pedidas, []);
});

test('lanza FuenteCambio si la página de redirección no trae destino', async () => {
  const rutas = rutasFelices();
  rutas[EMBED.url] = () => new Response('<html>nada</html>');
  await assert.rejects(crearResolverVoe(httpFalso(rutas).http)(EMBED, 'UA'), FuenteCambio);
});

test('lanza FuenteCambio si la página del reproductor no trae el bloque JSON', async () => {
  const rutas = rutasFelices();
  rutas[DESTINO] = () => new Response('<html>sin bloque</html>');
  await assert.rejects(crearResolverVoe(httpFalso(rutas).http)(EMBED, 'UA'), FuenteCambio);
});

test('lanza FuenteCambio si el source falta, no es URL o no es https', async () => {
  for (const source of [undefined, 42, 'no es una url', 'http://cdn.test/master.m3u8']) {
    const rutas = rutasFelices();
    rutas[DESTINO] = () => new Response(paginaVoe({ source }));
    await assert.rejects(crearResolverVoe(httpFalso(rutas).http)(EMBED, 'UA'), FuenteCambio);
  }
});

test('lanza FuenteCambio ante un HTTP de error en una de las páginas', async () => {
  const rutas = rutasFelices();
  rutas[DESTINO] = () => new Response('x', { status: 404 });
  await assert.rejects(crearResolverVoe(httpFalso(rutas).http)(EMBED, 'UA'), FuenteCambio);
});

test('un Desafio del cliente HTTP sube tal cual (la cadena decide qué hacer)', async () => {
  const rutas = rutasFelices();
  rutas[DESTINO] = () => {
    throw new Desafio('cloudflare en el espejo');
  };
  await assert.rejects(crearResolverVoe(httpFalso(rutas).http)(EMBED, 'UA'), Desafio);
});
