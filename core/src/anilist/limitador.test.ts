import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearLimitador } from './limitador.ts';

function relojFalso() {
  let t = 1_000_000;
  const esperas: number[] = [];
  return {
    esperas,
    reloj: {
      now: () => t,
      sleep: async (ms: number) => {
        esperas.push(ms);
        t += ms;
      },
    },
  };
}

test('deja pasar porMinuto peticiones sin esperar y frena la siguiente hasta que caduca la primera', async () => {
  const { reloj, esperas } = relojFalso();
  const l = crearLimitador(3, reloj);
  for (let i = 0; i < 3; i++) await l.esperar();
  assert.deepEqual(esperas, []);
  await l.esperar();
  assert.deepEqual(esperas, [60_000]);
});

test('las peticiones espaciadas no esperan', async () => {
  const { reloj, esperas } = relojFalso();
  const l = crearLimitador(2, reloj);
  await l.esperar();
  await reloj.sleep(30_000);
  await l.esperar();
  await reloj.sleep(31_000); // la primera ya caducó
  await l.esperar();
  assert.deepEqual(esperas, [30_000, 31_000]);
});

test('varias llamadas a la vez se sirven en orden y respetan el tope', async () => {
  const { reloj, esperas } = relojFalso();
  const l = crearLimitador(2, reloj);
  // Tope 2: las dos primeras pasan, la 3.ª espera un minuto (y con ella pasa la 4.ª) y la 5.ª espera otro.
  await Promise.all([l.esperar(), l.esperar(), l.esperar(), l.esperar(), l.esperar()]);
  assert.deepEqual(esperas, [60_000, 60_000]);
});
