import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completarSiTermino, debeCompletar } from './completar.ts';

const l = (estado: number | null, progreso: number, episodios: number | null) => ({ estado, progreso, episodios });

test('completa al llegar al total desde Viendo, Considerando, Pausado y Dropeado', () => {
  for (const estado of [1, 2, 5, 4]) assert.equal(debeCompletar(l(estado, 12, 12)), true, `estado ${estado}`);
});

test('no completa si falta algún episodio de la racha', () => {
  assert.equal(debeCompletar(l(1, 11, 12)), false);
  assert.equal(debeCompletar(l(1, 0, 12)), false);
});

test('no toca lo que ya está completado, lo que no está en la lista ni lo que no tiene vínculo', () => {
  assert.equal(debeCompletar(l(3, 12, 12)), false);
  assert.equal(debeCompletar(l(null, 12, 12)), false);
  assert.equal(debeCompletar(undefined), false);
});

test('sin total conocido no se adivina el final', () => {
  assert.equal(debeCompletar(l(1, 50, null)), false);
  assert.equal(debeCompletar(l(1, 0, 0)), false);
});

const serie = { aid: 7, slug: 's', titulo: 'T' };

test('completarSiTermino fija Completado una vez', async () => {
  const llamadas: string[] = [];
  const r = await completarSiTermino(serie, {
    local: async (aid) => (llamadas.push(`local:${aid}`), l(1, 12, 12)),
    fijarEstado: async (s, e) => void llamadas.push(`estado:${s.aid}=${e}`),
  });
  assert.equal(r, true);
  assert.deepEqual(llamadas, ['local:7', 'estado:7=3']);
});

test('completarSiTermino no hace nada si no corresponde', async () => {
  let fijado = false;
  const r = await completarSiTermino(serie, {
    local: async () => l(1, 5, 12),
    fijarEstado: async () => void (fijado = true),
  });
  assert.equal(r, false);
  assert.equal(fijado, false);
});

test('completarSiTermino no lanza si algo falla', async () => {
  const falla = async () => {
    throw new Error('disco');
  };
  assert.equal(await completarSiTermino(serie, { local: falla, fijarEstado: falla }), false);
  assert.equal(
    await completarSiTermino(serie, { local: async () => l(1, 12, 12), fijarEstado: falla }),
    false,
  );
});
