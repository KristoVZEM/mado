import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearConfirmacion } from './confirmar.ts';

function falso() {
  const tareas = new Map<number, () => void>();
  let id = 0;
  return {
    temporizador: {
      poner: (f: () => void) => (tareas.set(++id, f), id),
      quitar: (t: unknown) => void tareas.delete(t as number),
    },
    pendientes: () => tareas.size,
    disparar: () => [...tareas.values()].forEach((f) => f()),
  };
}

test('el primer clic pide confirmar y el segundo, sobre lo mismo, confirma', () => {
  const t = falso();
  const vistos: (number | null)[] = [];
  const c = crearConfirmacion<number>((x) => vistos.push(x), 4000, t.temporizador);
  assert.equal(c.pedir(7), false);
  assert.deepEqual(vistos, [7]);
  assert.equal(c.pedir(7), true);
  assert.deepEqual(vistos, [7, null]);
  assert.equal(t.pendientes(), 0, 'confirmar limpia el temporizador');
});

test('si pasa el tiempo sin confirmar, vuelve al estado normal', () => {
  const t = falso();
  const vistos: (number | null)[] = [];
  const c = crearConfirmacion<number>((x) => vistos.push(x), 4000, t.temporizador);
  c.pedir(7);
  t.disparar();
  assert.deepEqual(vistos, [7, null]);
  assert.equal(c.pedir(7), false, 'tras expirar hay que volver a pedir');
});

test('pedir otra tarjeta no confirma la anterior', () => {
  const t = falso();
  const vistos: (number | null)[] = [];
  const c = crearConfirmacion<number>((x) => vistos.push(x), 4000, t.temporizador);
  c.pedir(1);
  assert.equal(c.pedir(2), false);
  assert.deepEqual(vistos, [1, 2]);
  assert.equal(t.pendientes(), 1, 'solo queda el temporizador de la última');
  assert.equal(c.pedir(2), true);
});

test('cancelar vuelve al estado normal y exige pedir de nuevo', () => {
  const t = falso();
  const vistos: (number | null)[] = [];
  const c = crearConfirmacion<number>((x) => vistos.push(x), 4000, t.temporizador);
  c.pedir(3);
  c.cancelar();
  assert.deepEqual(vistos, [3, null]);
  assert.equal(c.pedir(3), false);
  c.cancelar();
  c.cancelar(); // sin nada pendiente no avisa dos veces
  assert.deepEqual(vistos, [3, null, 3, null]);
});
