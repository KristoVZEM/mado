import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreRelacion } from './relaciones.ts';

test('nombreRelacion traduce los tipos de AniList', () => {
  assert.equal(nombreRelacion('PREQUEL'), 'Precuela');
  assert.equal(nombreRelacion('SEQUEL'), 'Secuela');
  assert.equal(nombreRelacion('SIDE_STORY'), 'Historia paralela');
});

test('nombreRelacion da un nombre genérico a los tipos que no conoce', () => {
  assert.equal(nombreRelacion('COMPILATION'), 'Relacionada');
  assert.equal(nombreRelacion(''), 'Relacionada');
});
