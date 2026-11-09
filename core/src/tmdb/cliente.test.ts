import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoAutorizado, SinRed } from '../errors.ts';
import {
  crearClienteTmdb,
  elegirFondo,
  elegirLogo,
  elegirResultado,
  urlImagenTmdb,
} from './cliente.ts';
import type { ObraParaTmdb } from './tipos.ts';

const obra = (o: Partial<ObraParaTmdb> = {}): ObraParaTmdb => ({
  tituloRomaji: 'Shingeki no Kyojin Season 2',
  tituloIngles: 'Attack on Titan Season 2',
  tituloNativo: null,
  sinonimos: [],
  formato: 'TV',
  ...o,
});

const img = (file_path: string, iso_639_1: string | null, vote_average: number, width = 1920) => ({
  file_path,
  iso_639_1,
  vote_average,
  width,
});

test('elegirResultado ignora el número de temporada: el fondo es de la serie', () => {
  const r = elegirResultado([{ id: 1, name: 'Attack on Titan', original_name: '進撃の巨人' }], obra());
  assert.equal(r?.id, 1);
});

test('elegirResultado descarta lo que no se parece', () => {
  assert.equal(elegirResultado([{ id: 2, name: 'Titanic' }], obra()), null);
});

test('elegirResultado desempata por popularidad', () => {
  const r = elegirResultado(
    [
      { id: 1, name: 'Attack on Titan', popularity: 5 },
      { id: 2, name: 'Attack on Titan', popularity: 90 },
    ],
    obra(),
  );
  assert.equal(r?.id, 2);
});

test('elegirFondo prefiere el fondo sin texto de más nota', () => {
  assert.equal(
    elegirFondo([img('/con-texto.jpg', 'en', 9), img('/a.jpg', null, 5), img('/b.jpg', null, 7)]),
    '/b.jpg',
  );
});

test('elegirFondo usa uno con texto si no hay ninguno sin texto', () => {
  assert.equal(elegirFondo([img('/x.jpg', 'en', 3)]), '/x.jpg');
  assert.equal(elegirFondo([]), null);
});

test('elegirLogo prefiere el original: japonés, luego inglés, luego español', () => {
  assert.equal(elegirLogo([img('/es.png', 'es', 9), img('/ja.png', 'ja', 1), img('/en.png', 'en', 5)]), '/ja.png');
  assert.equal(elegirLogo([img('/es.png', 'es', 9), img('/en.png', 'en', 1)]), '/en.png');
  assert.equal(elegirLogo([img('/es.png', 'es', 9)]), '/es.png');
  assert.equal(elegirLogo([]), null);
});

test('elegirLogo pone primero el idioma original de la obra si no es japonés', () => {
  assert.equal(elegirLogo([img('/ja.png', 'ja', 9), img('/ko.png', 'ko', 1)], 'ko'), '/ko.png');
});

function fetchFalso(rutas: Record<string, unknown>, estado = 200) {
  const llamadas: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push(url);
    const u = new URL(url);
    const cuerpo = rutas[u.pathname];
    return {
      status: cuerpo === undefined ? 404 : estado,
      ok: cuerpo !== undefined && estado === 200,
      json: async () => cuerpo,
      headers: new Headers(),
      _init: init,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

test('buscarImagenes encuentra la serie y devuelve fondo y logo', async () => {
  const { f, llamadas } = fetchFalso({
    '/3/search/tv': { results: [{ id: 1429, name: 'Attack on Titan' }] },
    '/3/tv/1429/images': { backdrops: [img('/f.jpg', null, 8)], logos: [img('/l.png', 'en', 5)] },
  });
  const c = crearClienteTmdb({ fetch: f, clave: () => 'a'.repeat(32) });
  const r = await c.buscarImagenes(obra());
  assert.deepEqual(r, { tmdbId: 1429, tipo: 'tv', fondo: '/f.jpg', logo: '/l.png' });
  assert.ok(llamadas[0].includes('api_key='));
});

test('buscarImagenes usa Bearer si la clave es un token v4', async () => {
  let cabecera: string | undefined;
  const f = (async (_u: string, init?: RequestInit) => {
    cabecera = (init?.headers as Record<string, string>).authorization;
    return { status: 200, ok: true, json: async () => ({ results: [] }), headers: new Headers() } as unknown as Response;
  }) as unknown as typeof fetch;
  const c = crearClienteTmdb({ fetch: f, clave: () => 'eyJabc.def' });
  await c.buscarImagenes(obra({ tituloIngles: null, tituloNativo: null }));
  assert.equal(cabecera, 'Bearer eyJabc.def');
});

test('buscarImagenes usa la ruta de películas para MOVIE', async () => {
  const { f, llamadas } = fetchFalso({ '/3/search/movie': { results: [] } });
  const c = crearClienteTmdb({ fetch: f, clave: () => 'k' });
  await c.buscarImagenes(obra({ formato: 'MOVIE', tituloIngles: null, tituloNativo: null }));
  assert.ok(llamadas[0].includes('/search/movie'));
});

test('buscarImagenes devuelve null si ningún título coincide', async () => {
  const { f } = fetchFalso({ '/3/search/tv': { results: [{ id: 9, name: 'Otra cosa' }] } });
  const c = crearClienteTmdb({ fetch: f, clave: () => 'k' });
  assert.equal(await c.buscarImagenes(obra()), null);
});

test('buscarImagenes devuelve null sin clave y no hace peticiones', async () => {
  const { f, llamadas } = fetchFalso({});
  const c = crearClienteTmdb({ fetch: f, clave: () => null });
  assert.equal(await c.buscarImagenes(obra()), null);
  assert.equal(llamadas.length, 0);
});

test('una clave rechazada lanza NoAutorizado', async () => {
  const { f } = fetchFalso({ '/3/search/tv': {} }, 401);
  const c = crearClienteTmdb({ fetch: f, clave: () => 'mala' });
  await assert.rejects(() => c.buscarImagenes(obra()), NoAutorizado);
});

test('un 429 o un 5xx lanzan SinRed', async () => {
  const { f } = fetchFalso({ '/3/search/tv': {} }, 503);
  const c = crearClienteTmdb({ fetch: f, clave: () => 'k' });
  await assert.rejects(() => c.buscarImagenes(obra()), SinRed);
});

test('urlImagenTmdb une tamaño y ruta', () => {
  assert.equal(urlImagenTmdb('/a.jpg', 'original'), 'https://image.tmdb.org/t/p/original/a.jpg');
});
