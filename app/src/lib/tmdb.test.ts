import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FilaTmdb } from './datos.ts';
import { CRITERIO_DESDE_MS, DIAS_REFRESCO, DIAS_REINTENTO_VACIO, debeConsultar, urlFondoTmdb, urlLogoTmdb } from './tmdb.ts';

const DIA = 24 * 60 * 60 * 1000;
const fila = (o: Partial<FilaTmdb> = {}): FilaTmdb => ({
  anilistId: 1,
  tmdbId: 10,
  tipo: 'tv',
  fondo: '/f.jpg',
  logo: '/l.png',
  consultadoEn: CRITERIO_DESDE_MS,
  ...o,
});

test('lo consultado antes del criterio actual se vuelve a consultar', () => {
  assert.equal(debeConsultar(fila({ consultadoEn: CRITERIO_DESDE_MS - 1 }), CRITERIO_DESDE_MS), true);
  assert.equal(debeConsultar(fila({ consultadoEn: CRITERIO_DESDE_MS }), CRITERIO_DESDE_MS + DIA), false);
});

test('nunca consultada: se consulta', () => {
  assert.equal(debeConsultar(null, CRITERIO_DESDE_MS), true);
});

test('lo encontrado no se vuelve a pedir hasta que pasa mucho tiempo', () => {
  assert.equal(debeConsultar(fila(), CRITERIO_DESDE_MS + (DIAS_REFRESCO - 1) * DIA), false);
  assert.equal(debeConsultar(fila(), CRITERIO_DESDE_MS + DIAS_REFRESCO * DIA), true);
});

test('una búsqueda sin resultado se repite antes', () => {
  const vacia = fila({ tmdbId: null, tipo: null, fondo: null, logo: null });
  assert.equal(debeConsultar(vacia, CRITERIO_DESDE_MS + (DIAS_REINTENTO_VACIO - 1) * DIA), false);
  assert.equal(debeConsultar(vacia, CRITERIO_DESDE_MS + DIAS_REINTENTO_VACIO * DIA), true);
});

test('una serie encontrada pero sin imágenes también se repite antes', () => {
  assert.equal(debeConsultar(fila({ fondo: null, logo: null }), CRITERIO_DESDE_MS + DIAS_REINTENTO_VACIO * DIA), true);
});

test('las direcciones llevan el tamaño', () => {
  assert.equal(urlFondoTmdb('/f.jpg'), 'https://image.tmdb.org/t/p/original/f.jpg');
  assert.equal(urlLogoTmdb('/l.png'), 'https://image.tmdb.org/t/p/w500/l.png');
});
