import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntradaBiblioteca, EntradaContinuar, ResumenSerie } from './datos.ts';
import { conNuevoEpisodio, elegirDestacado, elegirDestacados, etiquetaNuevo, nuevoDe } from './destacado.ts';

const cont = (aid: number, numero = 3): EntradaContinuar => ({
  aid,
  slug: `s${aid}`,
  titulo: `S${aid}`,
  numero,
  posicionS: 10,
  duracionS: 100,
  actualizado: 0,
});
const bib = (aid: number): EntradaBiblioteca => ({ aid, slug: `s${aid}`, titulo: `S${aid}`, estado: 1, ultimoEpisodio: 2 });
const res = (aid: number, banner: string | null, extra: Partial<ResumenSerie> = {}): ResumenSerie => ({
  aid,
  anilistId: aid * 10,
  confianza: 0.9,
  origen: 'auto',
  banner,
  portada: null,
  siguienteEp: null,
  siguienteEn: null,
  episodios: null,
  estado: null,
  ...extra,
});

test('elegirDestacado prefiere la primera de "continuar" que tenga banner', () => {
  const d = elegirDestacado([cont(1), cont(2)], [bib(9)], [res(1, null), res(2, 'https://b/2.jpg'), res(9, 'https://b/9.jpg')]);
  assert.deepEqual(d, { aid: 2, anilistId: 20, slug: 's2', titulo: 'S2', banner: 'https://b/2.jpg', numero: 3 });
});

test('elegirDestacado cae a "siguiendo" (sin episodio que continuar) si ninguna de continuar tiene banner', () => {
  const d = elegirDestacado([cont(1)], [bib(8), bib(9)], [res(1, null), res(9, 'https://b/9.jpg')]);
  assert.deepEqual(d, { aid: 9, anilistId: 90, slug: 's9', titulo: 'S9', banner: 'https://b/9.jpg', numero: null });
});

test('elegirDestacado devuelve null si nadie tiene banner o no hay resúmenes', () => {
  assert.equal(elegirDestacado([cont(1)], [bib(2)], [res(1, null)]), null);
  assert.equal(elegirDestacado([cont(1)], [bib(2)], []), null);
  assert.equal(elegirDestacado([], [], [res(1, 'https://b/1.jpg')]), null);
});

test('nuevoDe devuelve el último episodio emitido solo si es mayor que el último visto', () => {
  const emision = res(1, null, { siguienteEp: 8, episodios: 12, estado: 'RELEASING' });
  assert.equal(nuevoDe(emision, 5), 7);
  assert.equal(nuevoDe(emision, 7), null);
  assert.equal(nuevoDe(emision, null), 7);
  const terminada = res(2, null, { episodios: 24, estado: 'FINISHED' });
  assert.equal(nuevoDe(terminada, null), 24);
  assert.equal(nuevoDe(terminada, 24), null);
  assert.equal(nuevoDe(undefined, 3), null);
  assert.equal(nuevoDe(res(3, null), 3), null);
});

test('etiquetaNuevo solo da texto si hay episodio nuevo', () => {
  const emision = res(1, null, { siguienteEp: 8, episodios: 12, estado: 'RELEASING' });
  assert.equal(etiquetaNuevo(emision, 5), 'Nuevo · Ep. 7 emitido');
  assert.equal(etiquetaNuevo(emision, 7), undefined);
  assert.equal(etiquetaNuevo(undefined, 0), undefined);
});

test('conNuevoEpisodio: solo series en emisión con un episodio emitido que no has visto', () => {
  const emitiendo = (aid: number, siguienteEp: number) => res(aid, null, { estado: 'RELEASING', siguienteEp });
  const mapa = new Map([
    [1, emitiendo(1, 6)], // emitido 5, viste 2 -> nuevo
    [2, emitiendo(2, 3)], // emitido 2, viste 2 -> al día
    [3, res(3, null, { estado: 'FINISHED', episodios: 12 })], // terminada: no es nuevo
  ]);
  const lista = [bib(1), bib(2), bib(3), bib(4)]; // la 4 no tiene resumen
  assert.deepEqual(conNuevoEpisodio(lista, mapa).map((v) => v.aid), [1]);
  assert.deepEqual(conNuevoEpisodio([], mapa), []);
});

test('elegirDestacados pone primero «continuar», sin repetir y solo con banner', () => {
  const r = [res(1, 'b1'), res(2, null), res(3, 'b3'), res(4, 'b4')];
  const d = elegirDestacados([cont(3, 5), cont(2)], [bib(1), bib(3), bib(4)], r);
  assert.deepEqual(
    d.map((x) => [x.aid, x.numero]),
    [
      [3, 5],
      [1, null],
      [4, null],
    ],
  );
  assert.equal(d[0].anilistId, 30);
});

test('elegirDestacados respeta el máximo y devuelve [] si ninguna tiene banner', () => {
  const r = [1, 2, 3, 4].map((a) => res(a, `b${a}`));
  assert.equal(elegirDestacados([], [bib(1), bib(2), bib(3), bib(4)], r, 2).length, 2);
  assert.deepEqual(elegirDestacados([cont(1)], [bib(2)], [res(1, null), res(2, null)]), []);
});
