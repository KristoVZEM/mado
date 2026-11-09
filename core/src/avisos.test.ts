import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planearAvisos, textoAviso, type SerieVigilada } from './avisos.ts';

const s = (p: Partial<SerieVigilada> = {}): SerieVigilada => ({
  aid: 1, titulo: 'Serie', ultimoAvisado: 4, ultimoVisto: 4, disponibles: [1, 2, 3, 4], ...p,
});

test('sin episodio nuevo no hay aviso ni escritura', () => {
  assert.deepEqual(planearAvisos([s()]), { avisos: [], guardar: [] });
  assert.deepEqual(planearAvisos([s({ disponibles: [] })]), { avisos: [], guardar: [] });
});

test('un episodio nuevo avisa y se guarda', () => {
  const p = planearAvisos([s({ disponibles: [1, 2, 3, 4, 5] })]);
  assert.deepEqual(p.avisos, [{ aid: 1, titulo: 'Serie', episodios: [5] }]);
  assert.deepEqual(p.guardar, [{ aid: 1, ultimo: 5 }]);
});

test('varios episodios nuevos se juntan en un aviso', () => {
  const p = planearAvisos([s({ disponibles: [4, 5, 6] })]);
  assert.deepEqual(p.avisos[0].episodios, [5, 6]);
  assert.deepEqual(p.guardar, [{ aid: 1, ultimo: 6 }]);
});

test('la primera vez guarda lo disponible sin avisar', () => {
  const p = planearAvisos([s({ ultimoAvisado: null, ultimoVisto: 0, disponibles: [1, 2, 3] })]);
  assert.deepEqual(p, { avisos: [], guardar: [{ aid: 1, ultimo: 3 }] });
});

test('lo ya visto no avisa pero adelanta el último avisado', () => {
  const p = planearAvisos([s({ ultimoAvisado: 4, ultimoVisto: 6, disponibles: [5, 6] })]);
  assert.deepEqual(p, { avisos: [], guardar: [{ aid: 1, ultimo: 6 }] });
});

test('no repite un episodio ya avisado', () => {
  const p = planearAvisos([s({ ultimoAvisado: 5, ultimoVisto: 4, disponibles: [4, 5] })]);
  assert.deepEqual(p, { avisos: [], guardar: [] });
});

test('texto: una serie con un episodio, con varios y varias series', () => {
  assert.deepEqual(textoAviso([{ aid: 1, titulo: 'A', episodios: [5] }]), { titulo: 'A', cuerpo: 'Episodio 5 disponible' });
  assert.deepEqual(textoAviso([{ aid: 1, titulo: 'A', episodios: [5, 6] }]), { titulo: 'A', cuerpo: 'Episodios 5 y 6 disponibles' });
  assert.deepEqual(
    textoAviso([
      { aid: 1, titulo: 'A', episodios: [5] },
      { aid: 2, titulo: 'B', episodios: [3] },
      { aid: 3, titulo: 'C', episodios: [9] },
    ]),
    { titulo: '3 episodios nuevos', cuerpo: 'A (5), B (3), C (9)' },
  );
});
