import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearRespaldador, type DepsRespaldo } from './respaldoAuto.ts';

const DIA = 86_400_000;

function deps(sobre: Partial<DepsRespaldo> = {}) {
  const llamadas: string[] = [];
  const d: DepsRespaldo = {
    autoRespaldo: async () => '1',
    ultimo: async () => null,
    ahora: () => new Date(2026, 10, 10, 12).getTime(),
    crear: async (etiqueta) => void llamadas.push(`crear ${etiqueta}`),
    anotar: async (ms) => void llamadas.push(`anotar ${ms}`),
    ...sobre,
  };
  return { d, llamadas };
}

test('con el respaldo apagado no hace nada', async () => {
  const { d, llamadas } = deps({ autoRespaldo: async () => '0' });
  assert.equal(await crearRespaldador(d).comprobar(), false);
  assert.deepEqual(llamadas, []);
});

test('si toca, crea el respaldo del día y anota la hora después', async () => {
  const { d, llamadas } = deps();
  assert.equal(await crearRespaldador(d).comprobar(), true);
  assert.deepEqual(llamadas, ['crear 2026-11-10', `anotar ${d.ahora()}`]);
});

test('si hace poco que se hizo, no toca', async () => {
  const ahora = new Date(2026, 10, 10, 12).getTime();
  const { d, llamadas } = deps({ autoRespaldo: async () => '2', ultimo: async () => String(ahora - 3 * DIA) });
  assert.equal(await crearRespaldador(d).comprobar(), false);
  assert.deepEqual(llamadas, []);
});

test('si crear falla no anota la hora ni lanza, y se reintenta después', async () => {
  let falla = true;
  const llamadas: string[] = [];
  const { d } = deps({
    crear: async () => {
      if (falla) throw new Error('disco lleno');
      llamadas.push('crear ok');
    },
    anotar: async () => void llamadas.push('anotar'),
  });
  const r = crearRespaldador(d);
  assert.equal(await r.comprobar(), false);
  assert.deepEqual(llamadas, [], 'sin hora anotada');
  falla = false;
  assert.equal(await r.comprobar(), true);
  assert.deepEqual(llamadas, ['crear ok', 'anotar']);
});

test('leer los ajustes con error no lanza', async () => {
  const { d } = deps({
    autoRespaldo: async () => {
      throw new Error('base no disponible');
    },
  });
  assert.equal(await crearRespaldador(d).comprobar(), false);
});

test('dos comprobaciones a la vez no se solapan', async () => {
  let crear = 0;
  let soltar: () => void = () => {};
  const { d } = deps({
    crear: () =>
      new Promise<void>((r) => {
        crear++;
        soltar = r;
      }),
  });
  const r = crearRespaldador(d);
  const primera = r.comprobar();
  await new Promise((r2) => setTimeout(r2, 0));
  assert.equal(await r.comprobar(), false);
  soltar();
  assert.equal(await primera, true);
  assert.equal(crear, 1);
});
