import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alCerrar, ejecutarAlCerrar, esperarConTope } from './cierre.ts';

test('esperarConTope devuelve el resultado si llega a tiempo', async () => {
  assert.equal(await esperarConTope(Promise.resolve(7), 50), 7);
});

test('esperarConTope suelta la espera cuando se agota el tope y no lanza', async () => {
  const nunca = new Promise<number>(() => {});
  assert.equal(await esperarConTope(nunca, 20), undefined);
});

test('esperarConTope no propaga el rechazo de la promesa', async () => {
  assert.equal(await esperarConTope(Promise.reject(new Error('x')), 50), undefined);
});

test('ejecutarAlCerrar corre todas las tareas aunque alguna falle', async () => {
  const log: string[] = [];
  const quitar = [
    alCerrar(async () => void log.push('a')),
    alCerrar(() => {
      throw new Error('falla');
    }),
    alCerrar(async () => void log.push('b')),
  ];
  await ejecutarAlCerrar(100);
  assert.deepEqual(log.sort(), ['a', 'b']);
  quitar.forEach((q) => q());
});

test('una tarea quitada no se ejecuta y una colgada no bloquea más del tope', async () => {
  const log: string[] = [];
  const quitar = alCerrar(async () => void log.push('quitada'));
  quitar();
  const colgada = alCerrar(() => new Promise<void>(() => {}));
  const t0 = Date.now();
  await ejecutarAlCerrar(40);
  assert.ok(Date.now() - t0 < 500, 'respeta el tope');
  assert.deepEqual(log, []);
  colgada();
});
