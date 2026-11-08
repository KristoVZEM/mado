import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Biblioteca, EntradaBiblioteca } from './datos.ts';
import {
  entradasDe,
  filtrar,
  muestraEstado,
  nombreEstado,
  ordenarPorTitulo,
  PESTANAS,
  recuentos,
  textoUltimoVisto,
  textoVacio,
} from './biblioteca.ts';

const e = (aid: number, titulo: string, estado: number | null, ultimoEpisodio: number | null = null): EntradaBiblioteca => ({
  aid,
  slug: `s-${aid}`,
  titulo,
  estado,
  ultimoEpisodio,
});

const b: Biblioteca = {
  siguiendo: [e(1, 'one piece', 1, 1100), e(2, 'Ñandú', 3), e(3, 'Naruto', 1, 220), e(4, 'Akira', 4), e(5, 'Élite', 5)],
  favoritos: [e(3, 'Naruto', 1, 220), e(6, 'Bleach', null)],
};

test('nombreEstado da el nombre de Ukiku y "Sin estado" para lo demás', () => {
  assert.equal(nombreEstado(1), 'Viendo');
  assert.equal(nombreEstado(2), 'Considerando');
  assert.equal(nombreEstado(5), 'Pausado');
  assert.equal(nombreEstado(null), 'Sin estado');
  assert.equal(nombreEstado(0), 'Sin estado');
  assert.equal(nombreEstado(9), 'Sin estado');
});

test('PESTANAS va de Todos a Favoritos con los cinco estados en medio', () => {
  assert.deepEqual(
    PESTANAS.map((p) => p.id),
    ['todos', 'viendo', 'considerando', 'completado', 'dropeado', 'pausado', 'favoritos'],
  );
});

test('filtrar separa por pestaña', () => {
  assert.equal(filtrar(b, 'todos').length, 5);
  assert.deepEqual(filtrar(b, 'viendo').map((x) => x.aid), [1, 3]);
  assert.deepEqual(filtrar(b, 'considerando'), []);
  assert.deepEqual(filtrar(b, 'dropeado').map((x) => x.aid), [4]);
  assert.deepEqual(filtrar(b, 'favoritos').map((x) => x.aid), [3, 6]);
});

test('ordenarPorTitulo sigue el orden del español y no modifica la lista', () => {
  assert.deepEqual(
    ordenarPorTitulo(b.siguiendo).map((x) => x.titulo),
    ['Akira', 'Élite', 'Naruto', 'Ñandú', 'one piece'],
  );
  assert.equal(b.siguiendo[0].aid, 1);
});

test('ordenarPorTitulo desempata por aid', () => {
  assert.deepEqual(ordenarPorTitulo([e(9, 'X', 1), e(8, 'X', 1)]).map((x) => x.aid), [8, 9]);
});

test('entradasDe filtra y ordena', () => {
  assert.deepEqual(entradasDe(b, 'viendo').map((x) => x.titulo), ['Naruto', 'one piece']);
});

test('recuentos cuenta cada pestaña', () => {
  assert.deepEqual(recuentos(b), {
    todos: 5,
    viendo: 2,
    considerando: 0,
    completado: 1,
    dropeado: 1,
    pausado: 1,
    favoritos: 2,
  });
});

test('textoUltimoVisto', () => {
  assert.equal(textoUltimoVisto(12), 'Último visto: Ep. 12');
  assert.equal(textoUltimoVisto(12.5), 'Último visto: Ep. 12.5');
  assert.equal(textoUltimoVisto(0), 'Último visto: Ep. 0');
  assert.equal(textoUltimoVisto(null), null);
});

test('muestraEstado solo en las pestañas que mezclan estados', () => {
  assert.equal(muestraEstado('todos'), true);
  assert.equal(muestraEstado('favoritos'), true);
  assert.equal(muestraEstado('viendo'), false);
});

test('textoVacio explica cada pestaña vacía', () => {
  assert.equal(textoVacio('considerando'), 'No hay series en «Considerando».');
  assert.ok(textoVacio('todos').includes('Ajustes'));
  assert.ok(textoVacio('favoritos').includes('☆'));
});
