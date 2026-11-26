import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearPrecargador, MAX_PRECARGA, urlsDeInicio } from './precargaInicio.ts';

const ent = (aid: number, numero = 1) => ({ aid, slug: `s${aid}`, titulo: `Serie ${aid}`, numero });
const bib = (aid: number) => ({ aid, slug: `s${aid}`, titulo: `Serie ${aid}`, estado: 1, ultimoEpisodio: 1, vistoEn: null, vistos: 0, total: null, puntuacion: null, generos: [] });
const dest = (aid: number, banner = `https://s4.anilist.co/banner/${aid}.jpg`) => ({
  destacado: { aid, anilistId: aid, slug: `s${aid}`, titulo: `Serie ${aid}`, banner, numero: null },
  media: null,
});

test('el tope de imágenes es 24', () => {
  assert.equal(MAX_PRECARGA, 24);
});

test('empieza por lo que más se ve: banners de la cabecera, capturas de «Continuar viendo» y pósters de las filas', () => {
  const urls = urlsDeInicio({
    destacados: [dest(1), dest(2)],
    pendientes: [ent(3, 5)],
    nuevos: [bib(4)],
    viendo: [bib(5)],
    considerando: [bib(6)],
    bannerDe: () => null,
  });
  assert.deepEqual(urls, [
    'https://s4.anilist.co/banner/1.jpg',
    'https://s4.anilist.co/banner/2.jpg',
    'https://cdn.animeav1.com/screenshots/3/5.jpg',
    'https://cdn.animeav1.com/covers/4.jpg',
    'https://cdn.animeav1.com/covers/5.jpg',
    'https://cdn.animeav1.com/covers/6.jpg',
  ]);
});

test('en «Continuar viendo» manda el banner de AniList si lo hay, como la tarjeta', () => {
  const urls = urlsDeInicio({
    destacados: [],
    pendientes: [ent(3, 5)],
    nuevos: [],
    viendo: [],
    considerando: [],
    bannerDe: (aid) => (aid === 3 ? 'https://s4.anilist.co/banner/3.jpg' : null),
  });
  assert.deepEqual(urls, ['https://s4.anilist.co/banner/3.jpg']);
});

test('no repite una misma imagen, aunque la serie salga en varias filas', () => {
  const urls = urlsDeInicio({
    destacados: [],
    pendientes: [],
    nuevos: [bib(4)],
    viendo: [bib(4), bib(5)],
    considerando: [bib(5)],
    bannerDe: () => null,
  });
  assert.deepEqual(urls, ['https://cdn.animeav1.com/covers/4.jpg', 'https://cdn.animeav1.com/covers/5.jpg']);
});

test('corta en el tope y descarta lo que no es una dirección https', () => {
  const fila = (desde: number) => Array.from({ length: 40 }, (_, i) => bib(desde + i));
  const urls = urlsDeInicio({
    destacados: [dest(1), dest(2), dest(3), dest(4)],
    pendientes: Array.from({ length: 10 }, (_, i) => ent(100 + i)),
    nuevos: fila(200),
    viendo: fila(300),
    considerando: fila(400),
    bannerDe: () => null,
  });
  assert.equal(urls.length, MAX_PRECARGA);
  const raras = urlsDeInicio({
    destacados: [dest(1, 'http://inseguro.test/a.jpg'), dest(2, ''), dest(3, 'javascript:alert(1)'), dest(4)],
    pendientes: [],
    nuevos: [],
    viendo: [],
    considerando: [],
    bannerDe: () => null,
  });
  assert.deepEqual(raras, ['https://s4.anilist.co/banner/4.jpg']);
});

test('con un aid o un número que no valen no hay imagen que pedir', () => {
  const urls = urlsDeInicio({
    destacados: [],
    pendientes: [ent(0, 1), ent(7, Number.NaN)],
    nuevos: [bib(-3)],
    viendo: [],
    considerando: [],
    bannerDe: () => null,
  });
  assert.deepEqual(urls, []);
});

test('el precargador pide cada imagen una sola vez, también entre llamadas', () => {
  const pedidas: string[] = [];
  const precargar = crearPrecargador((u) => void pedidas.push(u));
  precargar(['https://a.test/1.jpg', 'https://a.test/2.jpg', 'https://a.test/1.jpg']);
  precargar(['https://a.test/2.jpg', 'https://a.test/3.jpg']);
  assert.deepEqual(pedidas, ['https://a.test/1.jpg', 'https://a.test/2.jpg', 'https://a.test/3.jpg']);
});

test('un fallo al pedir una imagen no impide pedir las demás', () => {
  const pedidas: string[] = [];
  const precargar = crearPrecargador((u) => {
    if (u.endsWith('/1.jpg')) throw new Error('boom');
    pedidas.push(u);
  });
  assert.doesNotThrow(() => precargar(['https://a.test/1.jpg', 'https://a.test/2.jpg']));
  assert.deepEqual(pedidas, ['https://a.test/2.jpg']);
});
