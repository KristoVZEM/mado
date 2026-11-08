import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCola } from './cola.ts';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('ejecuta las tareas en el orden en que se piden, aunque la primera tarde más', async () => {
  const ejecutar = crearCola();
  const orden: string[] = [];
  const a = ejecutar(async () => {
    await espera(30);
    orden.push('a');
  });
  const b = ejecutar(async () => {
    orden.push('b');
  });
  await Promise.all([a, b]);
  assert.deepEqual(orden, ['a', 'b']);
});

test('no solapa tareas: una no empieza hasta que la anterior termina', async () => {
  const ejecutar = crearCola();
  let simultaneas = 0;
  let maximo = 0;
  const tarea = async () => {
    simultaneas++;
    maximo = Math.max(maximo, simultaneas);
    await espera(10);
    simultaneas--;
  };
  await Promise.all([ejecutar(tarea), ejecutar(tarea), ejecutar(tarea)]);
  assert.equal(maximo, 1);
});

test('devuelve el valor de cada tarea', async () => {
  const ejecutar = crearCola();
  assert.equal(await ejecutar(async () => 42), 42);
  assert.equal(await ejecutar(async () => 'x'), 'x');
});

test('una tarea que falla rechaza su promesa pero no bloquea las siguientes', async () => {
  const ejecutar = crearCola();
  const fallida = ejecutar(async () => {
    throw new Error('falló');
  });
  const siguiente = ejecutar(async () => 'ok');
  await assert.rejects(fallida, /falló/);
  assert.equal(await siguiente, 'ok');
});
