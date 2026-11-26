import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coincide, seriesDeBiblioteca } from './busquedaLocal.ts';
import type { EntradaBiblioteca } from './datos.ts';

const bib = (aid: number, titulo: string, estado: number): EntradaBiblioteca => ({
  aid,
  slug: `s${aid}`,
  titulo,
  estado,
  ultimoEpisodio: null,
  vistoEn: null,
  vistos: 0,
  total: null,
  puntuacion: null,
  generos: [],
});

test('coincide ignora tildes y mayúsculas y exige todas las palabras', () => {
  assert.equal(coincide('KOKORO', 'Kokoro no Kakera'), true);
  assert.equal(coincide('catalogo', 'Catálogo'), true);
  assert.equal(coincide('chainsaw man', 'Man of the Chainsaw'), true);
  assert.equal(coincide('chainsaw dog', 'Chainsaw Man'), false);
  assert.equal(coincide('   ', 'Algo'), false);
});

test('seriesDeBiblioteca pone primero las que estás viendo y respeta el máximo', () => {
  const r = seriesDeBiblioteca(
    'one',
    [bib(1, 'One Piece', 2), bib(2, 'One Punch Man', 1), bib(3, 'Otra', 1), bib(4, 'Bone', 3)],
    2,
  );
  assert.deepEqual(r.map((x) => x.aid), [2, 1]);
});

test('seriesDeBiblioteca sin coincidencias devuelve una lista vacía', () => {
  assert.deepEqual(seriesDeBiblioteca('zzz', [bib(1, 'One Piece', 1)]), []);
});
