import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Biblioteca, EntradaBiblioteca } from './datos.ts';
import {
  entradasDe,
  filtrar,
  nombreEstado,
  ordenarPorTitulo,
  PESTANAS,
  pestanaVecina,
  recuentos,
  textoUltimoVisto,
} from './biblioteca.ts';

const e = (aid: number, titulo: string, estado: number | null, ultimoEpisodio: number | null = null): EntradaBiblioteca => ({
  aid,
  slug: `s-${aid}`,
  titulo,
  estado,
  ultimoEpisodio,
  vistoEn: null,
  vistos: 0,
  total: null,
  puntuacion: null,
  generos: [],
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

test('PESTANAS: Todas y los cinco estados, sin Favoritos (ahora es un filtro)', () => {
  assert.deepEqual(
    PESTANAS.map((p) => [p.id, p.nombre]),
    [['todos', 'Todas'], ['viendo', 'Viendo'], ['considerando', 'Considerando'], ['completado', 'Completado'],
      ['dropeado', 'Dropeado'], ['pausado', 'Pausado']],
  );
});

test('pestanaVecina: flechas con vuelta, Inicio y Fin; otra tecla no mueve', () => {
  assert.equal(pestanaVecina('todos', 'ArrowRight'), 'viendo');
  assert.equal(pestanaVecina('pausado', 'ArrowRight'), 'todos');
  assert.equal(pestanaVecina('todos', 'ArrowLeft'), 'pausado');
  assert.equal(pestanaVecina('completado', 'Home'), 'todos');
  assert.equal(pestanaVecina('viendo', 'End'), 'pausado');
  assert.equal(pestanaVecina('viendo', 'Enter'), null);
});

test('filtrar separa por pestaña', () => {
  assert.equal(filtrar(b, 'todos').length, 5);
  assert.deepEqual(filtrar(b, 'viendo').map((x) => x.aid), [1, 3]);
  assert.deepEqual(filtrar(b, 'considerando'), []);
  assert.deepEqual(filtrar(b, 'dropeado').map((x) => x.aid), [4]);
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
  });
});

test('textoUltimoVisto', () => {
  assert.equal(textoUltimoVisto(12), 'Último visto: Ep. 12');
  assert.equal(textoUltimoVisto(12.5), 'Último visto: Ep. 12.5');
  assert.equal(textoUltimoVisto(0), 'Último visto: Ep. 0');
  assert.equal(textoUltimoVisto(null), null);
});
