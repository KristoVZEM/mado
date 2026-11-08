import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { CUENTA_SIGUIENTE_S, iniciarCuentaAtras } from './cuenta.ts';

test('la cuenta atrás del siguiente episodio es de 10 s', () => {
  assert.equal(CUENTA_SIGUIENTE_S, 10);
});

test('avisa del valor inicial y baja de uno en uno hasta terminar', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const vistos: number[] = [];
    let terminado = 0;
    iniciarCuentaAtras(3, (n) => vistos.push(n), () => terminado++);
    assert.deepEqual(vistos, [3]);
    mock.timers.tick(1000);
    mock.timers.tick(1000);
    assert.deepEqual(vistos, [3, 2, 1]);
    assert.equal(terminado, 0);
    mock.timers.tick(1000);
    assert.deepEqual(vistos, [3, 2, 1, 0]);
    assert.equal(terminado, 1);
    mock.timers.tick(5000);
    assert.equal(terminado, 1, 'no vuelve a terminar');
  } finally {
    mock.timers.reset();
  }
});

test('cancelar detiene la cuenta sin llamar a alTerminar', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let terminado = 0;
    const cancelar = iniciarCuentaAtras(2, () => {}, () => terminado++);
    mock.timers.tick(1000);
    cancelar();
    mock.timers.tick(5000);
    assert.equal(terminado, 0);
  } finally {
    mock.timers.reset();
  }
});
