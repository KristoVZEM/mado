import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizar, parecido, PISO_CONTENIDO } from './titulos.ts';

test('normalizar quita tildes, signos y palabras de relleno, y conserva los números', () => {
  assert.equal(normalizar('Sōsō no Frieren: 2ª Temporada!'), 'soso no frieren 2');
  assert.equal(normalizar('Attack on Titan Season 2'), 'attack on titan 2');
  assert.equal(normalizar('  The   Rising of the Shield Hero  '), 'rising of shield hero');
  assert.equal(normalizar('¡¡¿?!!'), '');
});

test('parecido: idénticos 1, vacíos 0, distintos bajo', () => {
  assert.equal(parecido('one piece', 'one piece'), 1);
  assert.equal(parecido('', 'one piece'), 0);
  assert.ok(parecido('naruto', 'bleach') < 0.3);
});

test('parecido: contenido en el otro sube al piso, sin llegar a 1', () => {
  const p = parecido('frieren', 'sousou no frieren');
  assert.ok(p >= PISO_CONTENIDO && p < 1, String(p));
  // Muy corto: no cuenta como contenido (evita que "ao" case con cualquier cosa).
  assert.ok(parecido('ao', 'ao no exorcist') < PISO_CONTENIDO);
});

test('parecido es simétrico', () => {
  assert.equal(parecido('shingeki no kyojin', 'attack on titan'), parecido('attack on titan', 'shingeki no kyojin'));
});
