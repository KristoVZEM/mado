import { test } from 'node:test';
import assert from 'node:assert/strict';
import { servidoresElegibles, soloServidor } from './servidores.ts';

test('servidoresElegibles deja solo los que la app sabe resolver, sin repetir y en el orden del episodio', () => {
  assert.deepEqual(servidoresElegibles(['Otro', 'MP4Upload', 'HLS', 'HLS']), ['MP4Upload', 'HLS']);
  assert.deepEqual(servidoresElegibles(['Byse', 'UPNShare']), []);
  assert.deepEqual(servidoresElegibles([]), []);
});

test('soloServidor prefiere el elegido y excluye a todos los demás, también a los que la app no usa', () => {
  assert.deepEqual(soloServidor(['HLS', 'MP4Upload', 'Otro'], 'HLS'), { preferido: 'HLS', excluidos: ['MP4Upload', 'Otro'] });
  assert.deepEqual(soloServidor(['HLS'], 'HLS'), { preferido: 'HLS', excluidos: [] });
});
