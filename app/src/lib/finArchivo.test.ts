import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esFalloDeReproduccion } from './finArchivo.ts';

test('solo end-file con motivo error es un fallo', () => {
  assert.equal(esFalloDeReproduccion({ event: 'end-file', reason: 'error' }), true);
  for (const reason of ['eof', 'stop', 'quit', 'redirect', 'unknown']) {
    assert.equal(esFalloDeReproduccion({ event: 'end-file', reason }), false, reason);
  }
  assert.equal(esFalloDeReproduccion({ event: 'file-loaded' }), false);
  assert.equal(esFalloDeReproduccion({ event: 'idle', reason: 'error' }), false);
});
