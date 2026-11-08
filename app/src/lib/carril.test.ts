import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARRIL, SECCION_INICIAL } from './carril.ts';

test('los ids del carril son únicos y la sección inicial está en él', () => {
  const ids = CARRIL.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(SECCION_INICIAL));
});

test('Ajustes va siempre el último', () => {
  assert.equal(CARRIL.at(-1)?.id, 'ajustes');
});
