import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aEstadoLocal, MAX_PROGRESO, planificar, STATUS, type LocalSync, type RemotoSync } from './sync.ts';

const local = (o: Partial<LocalSync> = {}): LocalSync => ({
  aid: 1, anilistId: 100, estado: null, actualizado: 0, progreso: 0, episodios: null, ...o,
});
const remoto = (o: Partial<RemotoSync> = {}): RemotoSync => ({
  anilistId: 100, estado: 1, actualizado: 0, progreso: 0, ...o,
});
const vacio = { subir: [], bajar: [], conflictos: 0 };

test('mapeo de estados: 1:1 y REPEATING cuenta como Viendo', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((e) => STATUS[e as 1]), ['CURRENT', 'PLANNING', 'COMPLETED', 'DROPPED', 'PAUSED']);
  assert.equal(aEstadoLocal('COMPLETED'), 3);
  assert.equal(aEstadoLocal('REPEATING'), 1);
  assert.equal(aEstadoLocal('ALGO'), null);
});

test('sin nada que sincronizar no hace nada', () => {
  assert.deepEqual(planificar([], []), vacio);
  assert.deepEqual(planificar([], [remoto()]), vacio, 'una entrada remota sin serie vinculada se ignora');
  assert.deepEqual(planificar([local({ progreso: 3 })], []), vacio, 'progreso sin estado no crea nada en AniList');
});

test('solo en AniList (la serie ya está vinculada): baja estado con su hora y progreso', () => {
  const p = planificar([local()], [remoto({ estado: 3, actualizado: 5000, progreso: 12 })]);
  assert.deepEqual(p.bajar, [{ aid: 1, estado: 3, estadoEn: 5000, progreso: 12 }]);
  assert.deepEqual(p.subir, []);
});

test('solo en local con estado: crea en AniList con estado y progreso', () => {
  const p = planificar([local({ estado: 2, progreso: 0 })], []);
  assert.deepEqual(p.subir, [{ anilistId: 100, estado: 2 }]);
  const q = planificar([local({ estado: 1, progreso: 4 })], []);
  assert.deepEqual(q.subir, [{ anilistId: 100, estado: 1, progreso: 4 }]);
  assert.deepEqual(q.bajar, []);
});

test('iguales: no hace nada', () => {
  assert.deepEqual(planificar([local({ estado: 1, progreso: 5 })], [remoto({ estado: 1, progreso: 5 })]), vacio);
});

test('estado distinto: gana el más reciente y cuenta como conflicto', () => {
  const l = local({ estado: 1, actualizado: 2000 });
  const gana_local = planificar([l], [remoto({ estado: 4, actualizado: 1000 })]);
  assert.deepEqual(gana_local, { subir: [{ anilistId: 100, estado: 1 }], bajar: [], conflictos: 1 });
  const gana_remoto = planificar([l], [remoto({ estado: 4, actualizado: 3000 })]);
  assert.deepEqual(gana_remoto, { subir: [], bajar: [{ aid: 1, estado: 4, estadoEn: 3000 }], conflictos: 1 });
});

test('estado distinto con empate de hora: gana AniList', () => {
  const p = planificar([local({ estado: 1, actualizado: 1000 })], [remoto({ estado: 5, actualizado: 1000 })]);
  assert.deepEqual(p.bajar, [{ aid: 1, estado: 5, estadoEn: 1000 }]);
  assert.deepEqual(p.subir, []);
});

test('una fila local sin hora (0) pierde frente a AniList', () => {
  const p = planificar([local({ estado: 2, actualizado: 0 })], [remoto({ estado: 3, actualizado: 1 })]);
  assert.equal(p.bajar[0]?.estado, 3);
});

test('progreso: gana el mayor y nunca retrocede', () => {
  const l_mas = planificar([local({ estado: 1, progreso: 8 })], [remoto({ estado: 1, progreso: 5 })]);
  assert.deepEqual(l_mas, { subir: [{ anilistId: 100, progreso: 8 }], bajar: [], conflictos: 0 });
  const r_mas = planificar([local({ estado: 1, progreso: 5 })], [remoto({ estado: 1, progreso: 8 })]);
  assert.deepEqual(r_mas, { subir: [], bajar: [{ aid: 1, progreso: 8 }], conflictos: 0 });
});

test('estado y progreso se resuelven por separado', () => {
  const p = planificar(
    [local({ estado: 1, actualizado: 9000, progreso: 3 })],
    [remoto({ estado: 5, actualizado: 1000, progreso: 10 })],
  );
  assert.deepEqual(p.subir, [{ anilistId: 100, estado: 1 }]);
  assert.deepEqual(p.bajar, [{ aid: 1, progreso: 10 }]);
});

test('local sin estado pero con episodios vistos y entrada remota: sube solo el progreso mayor', () => {
  const p = planificar([local({ estado: null, progreso: 9 })], [remoto({ estado: 1, progreso: 4, actualizado: 7 })]);
  assert.deepEqual(p.bajar, [{ aid: 1, estado: 1, estadoEn: 7 }]);
  assert.deepEqual(p.subir, [{ anilistId: 100, progreso: 9 }]);
});

test('Completado con progreso menor al total: se completa en ambos lados', () => {
  const p = planificar([local({ estado: 3, actualizado: 9, progreso: 10, episodios: 12 })], [remoto({ estado: 3, progreso: 10 })]);
  assert.deepEqual(p.subir, [{ anilistId: 100, progreso: 12 }]);
  assert.deepEqual(p.bajar, [{ aid: 1, progreso: 12 }]);
});

test('Completado sin total conocido no inventa progreso', () => {
  const p = planificar([local({ estado: 3, progreso: 10, episodios: null })], [remoto({ estado: 3, progreso: 10 })]);
  assert.deepEqual(p, vacio);
});

test('REPEATING en AniList equivale a Viendo y no genera cambios si local ya es Viendo', () => {
  const r = { anilistId: 100, estado: aEstadoLocal('REPEATING')!, actualizado: 5, progreso: 3 };
  assert.deepEqual(planificar([local({ estado: 1, progreso: 3 })], [r]), vacio);
});

test('dos series locales con la misma obra: solo cuenta la de menor aid', () => {
  const p = planificar(
    [local({ aid: 7, estado: 2 }), local({ aid: 3, estado: 1 })],
    [],
  );
  assert.deepEqual(p.subir, [{ anilistId: 100, estado: 1 }]);
});

test('el progreso se acota a MAX_PROGRESO', () => {
  const p = planificar([local()], [remoto({ estado: 1, progreso: MAX_PROGRESO + 50 })]);
  assert.equal(p.bajar[0]?.progreso, MAX_PROGRESO);
});

test('varias series: un plan con todas, en orden de aid', () => {
  const p = planificar(
    [local({ aid: 2, anilistId: 200, estado: 1 }), local({ aid: 1, anilistId: 100 })],
    [remoto({ anilistId: 100, estado: 3, actualizado: 4 })],
  );
  assert.deepEqual(p.bajar.map((b) => b.aid), [1]);
  assert.deepEqual(p.subir.map((s) => s.anilistId), [200]);
});

test('un progreso local mayor que el total de episodios (numeración corrida) se acota y no se sube', () => {
  // animeav1 numera el 2.º cour como 14..25; AniList tiene 13 episodios en esa obra.
  const p = planificar([local({ estado: 1, progreso: 25, episodios: 13 })], [remoto({ estado: 1, progreso: 13 })]);
  assert.deepEqual(p, vacio);
  const nueva = planificar([local({ estado: 1, progreso: 25, episodios: 13 })], []);
  assert.deepEqual(nueva.subir, [{ anilistId: 100, estado: 1, progreso: 13 }]);
  assert.deepEqual(nueva.bajar, []);
});

test('con el total desconocido el progreso local no se acota', () => {
  const p = planificar([local({ estado: 1, progreso: 25, episodios: null })], []);
  assert.deepEqual(p.subir, [{ anilistId: 100, estado: 1, progreso: 25 }]);
});
