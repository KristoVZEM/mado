import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TAMANO_PAGINA,
  etiquetaPagina,
  paginaDe,
  paginar,
  seMuestraPaginador,
} from './paginasEpisodios.ts';

const de = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test('el tamaño de página es 24', () => {
  assert.equal(TAMANO_PAGINA, 24);
});

test('sin episodios no hay páginas', () => {
  assert.deepEqual(paginar([]), []);
});

test('hasta 24 episodios caben en una sola página', () => {
  assert.equal(paginar(de(24)).length, 1);
  assert.equal(paginar(de(1)).length, 1);
});

test('con 25 episodios la segunda página lleva solo el último', () => {
  const paginas = paginar(de(25));
  assert.equal(paginas.length, 2);
  assert.deepEqual(paginas[1], [25]);
});

test('las páginas conservan el orden recibido, también el descendente', () => {
  const desc = de(50).reverse();
  const paginas = paginar(desc);
  assert.equal(paginas.length, 3);
  assert.deepEqual([paginas[0][0], paginas[0].at(-1)], [50, 27]);
  assert.deepEqual(paginas[2], [2, 1]);
});

test('el paginador solo se muestra con más de una página', () => {
  assert.equal(seMuestraPaginador(24), false);
  assert.equal(seMuestraPaginador(25), true);
  assert.equal(seMuestraPaginador(0), false);
});

test('paginaDe devuelve la página que contiene el episodio', () => {
  const eps = de(100);
  assert.equal(paginaDe(eps, 1), 0);
  assert.equal(paginaDe(eps, 24), 0);
  assert.equal(paginaDe(eps, 25), 1);
  assert.equal(paginaDe(eps, 100), 4);
});

test('paginaDe con orden descendente sigue el orden mostrado', () => {
  const desc = de(100).reverse();
  assert.equal(paginaDe(desc, 100), 0);
  assert.equal(paginaDe(desc, 1), 4);
});

test('paginaDe acepta números con decimales y devuelve -1 si el episodio no existe', () => {
  assert.equal(paginaDe([1, 2, 12.5, 13], 12.5), 0);
  assert.equal(paginaDe(de(30), 31), -1);
  assert.equal(paginaDe(de(30), Number.NaN), -1);
});

test('con números repetidos paginaDe usa la primera aparición', () => {
  assert.equal(paginaDe([1, 2, 2, 3], 2), 0);
});

test('etiquetaPagina escribe el rango en el orden en que se ve', () => {
  assert.equal(etiquetaPagina([1, 2, 3, 24]), '1–24');
  assert.equal(etiquetaPagina([800, 799, 777]), '800–777');
  assert.equal(etiquetaPagina([25]), '25');
  assert.equal(etiquetaPagina([]), '');
});
