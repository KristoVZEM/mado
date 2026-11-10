import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIAS, categoriaPorDefecto } from './ajustesCategorias.ts';

test('los ids y los nombres de categoría son únicos', () => {
  assert.equal(new Set(CATEGORIAS.map((c) => c.id)).size, CATEGORIAS.length);
  assert.equal(new Set(CATEGORIAS.map((c) => c.nombre)).size, CATEGORIAS.length);
});

test('la categoría por defecto es la primera y existe', () => {
  assert.equal(categoriaPorDefecto(), CATEGORIAS[0].id);
});
