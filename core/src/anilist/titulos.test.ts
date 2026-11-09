import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizar, parecido, PISO_CONTENIDO, temporadaDe } from './titulos.ts';

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

test('temporadaDe lee el número de temporada final del título normalizado', () => {
  assert.equal(temporadaDe('kusuriya no hitorigoto 3rd'), 3);
  assert.equal(temporadaDe('kusuriya no hitorigoto 2nd'), 2);
  assert.equal(temporadaDe('shingeki no kyojin 2'), 2);
  assert.equal(temporadaDe('steins gate 0'), 0);
  assert.equal(temporadaDe('kusuriya no hitorigoto'), null);
  assert.equal(temporadaDe('mob psycho 100'), null); // tres cifras: parte del nombre
  assert.equal(temporadaDe('86 eighty six'), null);
  assert.equal(temporadaDe('2'), null); // solo un número: no es una temporada
});

test('temporadaDe lee numerales romanos, pero no los de una letra ni uno solo', () => {
  assert.equal(temporadaDe('overlord iv'), 4);
  assert.equal(temporadaDe('tiger bunny ii'), 2);
  assert.equal(temporadaDe('kono subarashii iii'), 3);
  for (const [t, n] of [['vi', 6], ['vii', 7], ['viii', 8], ['ix', 9]] as const) assert.equal(temporadaDe(`titulo ${t}`), n);
  for (const t of ['titulo i', 'titulo v', 'titulo x', 'ii', 'iii', 'overlord ivx', 'titulo iii extra']) {
    assert.equal(temporadaDe(t), null, t);
  }
});
