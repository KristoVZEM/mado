import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inicialDe, urlCaptura, urlPortada } from './imagenes.ts';

test('urlPortada usa el aid', () => {
  assert.equal(urlPortada(21), 'https://cdn.animeav1.com/covers/21.jpg');
});

test('urlCaptura usa aid y número, entero sin decimales', () => {
  assert.equal(urlCaptura(21, 3), 'https://cdn.animeav1.com/screenshots/21/3.jpg');
  assert.equal(urlCaptura(21, 1.5), 'https://cdn.animeav1.com/screenshots/21/1.5.jpg');
});

test('aid o número no válidos dan null', () => {
  for (const aid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(urlPortada(aid), null, String(aid));
    assert.equal(urlCaptura(aid, 1), null, String(aid));
  }
  for (const n of [-1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(urlCaptura(21, n), null, String(n));
});

test('inicialDe: primera letra en mayúscula, ? si no hay', () => {
  assert.equal(inicialDe('one piece'), 'O');
  assert.equal(inicialDe('  ñandú'), 'Ñ');
  assert.equal(inicialDe(''), '?');
  assert.equal(inicialDe('   '), '?');
});
