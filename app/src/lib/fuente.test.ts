import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Desafio, FuenteCambio, SinRed, SinServidor } from '../../../core/src/errors.ts';
import { causaDeFalloDeFuente, textoAvisoFuente } from './fuente.ts';

test('un desafío y una falta de respuesta son bloqueos de la fuente; lo demás no', () => {
  assert.equal(causaDeFalloDeFuente(new Desafio('x')), 'desafio');
  assert.equal(causaDeFalloDeFuente(new SinRed('x')), 'red');
  for (const otro of [new FuenteCambio('x'), new SinServidor('x', []), new Error('x'), 'texto', null, undefined]) {
    assert.equal(causaDeFalloDeFuente(otro), null);
  }
});

test('cada causa tiene su texto, que dice qué sigue funcionando y qué probar', () => {
  const red = textoAvisoFuente('red');
  const desafio = textoAvisoFuente('desafio');
  assert.notEqual(red, desafio);
  for (const t of [red, desafio]) {
    assert.match(t, /Biblioteca, Historial y Emisión siguen funcionando/);
    assert.match(t, /VPN/);
  }
  assert.match(desafio, /Cloudflare/);
});
