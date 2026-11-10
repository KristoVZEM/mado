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

test('normalizar iguala los ordinales con el número («2nd Season» y «Season 2» son lo mismo)', () => {
  assert.equal(normalizar('Aoashi 2nd Season'), 'aoashi 2');
  assert.equal(normalizar('Ao Ashi Season 2'), 'ao ashi 2');
  assert.equal(normalizar('Kusuriya no Hitorigoto 3rd Season'), 'kusuriya no hitorigoto 3');
  assert.equal(normalizar('Kizu darake Seijo Season2'), 'kizu darake seijo 2');
  assert.equal(normalizar('Mob Psycho 100'), 'mob psycho 100', 'una cifra suelta no se toca');
});

test('parecido ignora dónde caen los espacios («Aoashi» frente a «Ao Ashi»)', () => {
  assert.ok(parecido('aoashi 2', 'ao ashi 2') >= 0.95);
  assert.ok(parecido('aoashi', 'ao ashi') >= 0.95);
  assert.ok(parecido('ab', 'a b') < 0.85, 'los textos cortos no se comparan sin espacios');
});

test('normalizar escribe la fracción ½ como «1 2» («Ranma ½» y «Ranma 1/2» son el mismo título)', () => {
  assert.equal(normalizar('Ranma ½ (2024) 3rd Season'), normalizar('Ranma 1/2 (2024) Season 3'));
  assert.equal(normalizar('Ranma ½'), 'ranma 1 2');
});
