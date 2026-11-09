import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PendienteEmparejar } from './datos.ts';
import { crearEmparejador } from './emparejado.ts';

const p = (aid: number): PendienteEmparejar => ({ aid, slug: `s${aid}`, titulo: `S${aid}`, prioridad: 2 });

/** Simula la base: las series ya emparejadas dejan de ser pendientes; las que dan error siguen siéndolo. */
function entorno(todas: number[], resultado: (aid: number) => 'ok' | 'error' = () => 'ok') {
  const hechas = new Set<number>();
  const orden: number[] = [];
  const pausas: number[] = [];
  const peticiones: number[] = [];
  let activo = true;
  return {
    orden,
    pausas,
    peticiones,
    parar: () => (activo = false),
    deps: {
      pendientes: async (limite: number) => {
        peticiones.push(limite);
        return todas.filter((a) => !hechas.has(a)).slice(0, limite).map(p);
      },
      emparejar: async (x: PendienteEmparejar) => {
        orden.push(x.aid);
        const r = resultado(x.aid);
        if (r === 'ok') hechas.add(x.aid);
        return r;
      },
      pausa: async (ms: number) => void pausas.push(ms),
      activo: () => activo,
    },
  };
}

test('procesa todas las pendientes en tandas y en el orden recibido', async () => {
  const e = entorno([1, 2, 3, 4, 5]);
  const r = await crearEmparejador({ ...e.deps, tanda: 2 }).correr();
  assert.deepEqual(e.orden, [1, 2, 3, 4, 5]);
  assert.equal(r.procesadas, 5);
});

test('hace una pausa entre series, no antes de la primera ni tras la última', async () => {
  const e = entorno([1, 2, 3]);
  await crearEmparejador({ ...e.deps, tanda: 10, pausaMs: 1234 }).correr();
  assert.deepEqual(e.pausas, [1234, 1234]);
});

test('sin pendientes no hace nada', async () => {
  const e = entorno([]);
  const r = await crearEmparejador(e.deps).correr();
  assert.equal(r.procesadas, 0);
  assert.deepEqual(e.pausas, []);
});

test('se detiene si activo() pasa a falso a mitad', async () => {
  const e = entorno([1, 2, 3, 4]);
  const deps = {
    ...e.deps,
    emparejar: async (x: PendienteEmparejar) => {
      const r = await e.deps.emparejar(x);
      if (x.aid === 2) e.parar();
      return r;
    },
  };
  const r = await crearEmparejador({ ...deps, tanda: 10 }).correr();
  assert.deepEqual(e.orden, [1, 2]);
  assert.equal(r.procesadas, 2);
});

test('si toda una tanda falla, se detiene sin pedir más', async () => {
  const e = entorno([1, 2, 3, 4], () => 'error');
  const r = await crearEmparejador({ ...e.deps, tanda: 2 }).correr();
  assert.deepEqual(e.orden, [1, 2]);
  assert.equal(e.peticiones.length, 1);
  assert.equal(r.procesadas, 2);
});

test('una serie que falla no se reintenta en la misma pasada aunque siga pendiente', async () => {
  const e = entorno([1, 2, 3], (aid) => (aid === 2 ? 'error' : 'ok'));
  await crearEmparejador({ ...e.deps, tanda: 10 }).correr();
  assert.deepEqual(e.orden, [1, 2, 3]);
});

test('una excepción al emparejar cuenta como error y no interrumpe la pasada', async () => {
  const e = entorno([1, 2]);
  const deps = {
    ...e.deps,
    emparejar: async (x: PendienteEmparejar): Promise<'ok' | 'error'> => {
      if (x.aid === 1) throw new Error('boom');
      return e.deps.emparejar(x);
    },
  };
  const r = await crearEmparejador({ ...deps, tanda: 10 }).correr();
  assert.equal(r.procesadas, 2);
  assert.deepEqual(e.orden, [2]);
});
