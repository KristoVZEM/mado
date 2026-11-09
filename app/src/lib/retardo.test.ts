import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearRetardo } from './retardo.ts';

function reloj() {
  const pendientes: Array<{ f: () => void; vivo: boolean }> = [];
  return {
    pendientes,
    poner: (f: () => void) => {
      const t = { f, vivo: true };
      pendientes.push(t);
      return t;
    },
    quitar: (t: unknown) => void ((t as { vivo: boolean }).vivo = false),
    disparar: () => pendientes.filter((t) => t.vivo).forEach((t) => ((t.vivo = false), t.f())),
  };
}

test('solo guarda el último valor tras la pausa', () => {
  const r = reloj();
  const vistos: number[] = [];
  const d = crearRetardo<number>((v) => vistos.push(v), 400, r);
  d.llamar(1);
  d.llamar(2);
  d.llamar(3);
  assert.deepEqual(vistos, []);
  r.disparar();
  assert.deepEqual(vistos, [3]);
});

test('vaciar guarda ya el valor pendiente y cancela el temporizador', () => {
  const r = reloj();
  const vistos: number[] = [];
  const d = crearRetardo<number>((v) => vistos.push(v), 400, r);
  d.llamar(5);
  d.vaciar();
  assert.deepEqual(vistos, [5]);
  r.disparar();
  assert.deepEqual(vistos, [5], 'no se guarda dos veces');
});

test('vaciar sin nada pendiente no hace nada', () => {
  const vistos: number[] = [];
  crearRetardo<number>((v) => vistos.push(v), 400, reloj()).vaciar();
  assert.deepEqual(vistos, []);
});

test('después de guardar se puede volver a llamar', () => {
  const r = reloj();
  const vistos: number[] = [];
  const d = crearRetardo<number>((v) => vistos.push(v), 400, r);
  d.llamar(1);
  r.disparar();
  d.llamar(2);
  r.disparar();
  assert.deepEqual(vistos, [1, 2]);
});
