import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeDeError } from './errores.ts';
import { Desafio, FuenteCambio, SinRed, SinServidor } from '../../../core/src/errors.ts';

test('cada error del núcleo tiene su propio mensaje, todos en español', () => {
  const mensajes = [
    mensajeDeError(new SinRed('x')),
    mensajeDeError(new Desafio('x')),
    mensajeDeError(new FuenteCambio('x')),
    mensajeDeError(new SinServidor('x', [new SinRed('a'), new FuenteCambio('b')])),
    mensajeDeError(new Error('otro')),
  ];
  assert.equal(new Set(mensajes).size, mensajes.length);
  assert.match(mensajes[0], /VPN/);
});

test('SinServidor cuenta cuántos servidores fallaron', () => {
  assert.match(mensajeDeError(new SinServidor('x', [new SinRed('a'), new SinRed('b')])), /2/);
});

test('los mensajes no repiten el texto interno del error (puede llevar rutas o tokens)', () => {
  assert.ok(!mensajeDeError(new SinRed('SECRETO')).includes('SECRETO'));
  assert.ok(!mensajeDeError(new Error('SECRETO')).includes('SECRETO'));
});

test('un valor que no es un Error también produce un mensaje', () => {
  assert.ok(mensajeDeError('texto').length > 0);
  assert.ok(mensajeDeError(undefined).length > 0);
});
