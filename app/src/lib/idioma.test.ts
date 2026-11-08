import { test } from 'node:test';
import assert from 'node:assert/strict';
import { argumentosLoadfile, cambiarIdioma } from './idioma.ts';
import type { Playable } from '../../../core/src/index.ts';

const playable = { url: 'https://x/dub.m3u8', headers: {}, userAgent: 'ua' } as Playable;

test('argumentosLoadfile sin inicio carga solo la URL', () => {
  assert.deepEqual(argumentosLoadfile('https://x/a.m3u8'), ['https://x/a.m3u8']);
  assert.deepEqual(argumentosLoadfile('https://x/a.m3u8', 0), ['https://x/a.m3u8']);
});

test('argumentosLoadfile con inicio añade start= (mpv: url, flags, índice, opciones)', () => {
  assert.deepEqual(argumentosLoadfile('https://x/a.m3u8', 123.456), [
    'https://x/a.m3u8',
    'replace',
    '-1',
    'start=123.456',
  ]);
});

test('argumentosLoadfile ignora inicios negativos o no finitos', () => {
  assert.deepEqual(argumentosLoadfile('u', -3), ['u']);
  assert.deepEqual(argumentosLoadfile('u', Number.NaN), ['u']);
});

test('cambiarIdioma resuelve primero y carga después, en la misma posición', async () => {
  const llamadas: string[] = [];
  const p = await cambiarIdioma({
    nuevo: 'DUB',
    posicion: 61.5,
    resolver: async (i) => (llamadas.push(`resolver ${i}`), playable),
    cargar: async (_p, inicio) => void llamadas.push(`cargar ${inicio}`),
  });
  assert.equal(p, playable);
  assert.deepEqual(llamadas, ['resolver DUB', 'cargar 61.5']);
});

test('cambiarIdioma no carga nada si el nuevo idioma no resuelve', async () => {
  let cargado = false;
  await assert.rejects(
    cambiarIdioma({
      nuevo: 'DUB',
      posicion: 10,
      resolver: async () => { throw new Error('sin DUB'); },
      cargar: async () => { cargado = true; },
    }),
    /sin DUB/,
  );
  assert.equal(cargado, false);
});
