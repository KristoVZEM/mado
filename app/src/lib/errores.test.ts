import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeDeError, textoDeError } from './errores.ts';
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

test('SinServidor sin causas (no había servidores en ese idioma) tiene su propio mensaje', () => {
  const sin = mensajeDeError(new SinServidor('x', []));
  const con = mensajeDeError(new SinServidor('x', [new SinRed('a')]));
  assert.notEqual(sin, con);
  assert.ok(!/\d/.test(sin));
  assert.match(sin, /idioma/);
});

test('textoDeError usa el texto de un rechazo de invoke y traduce el resto', () => {
  assert.equal(textoDeError('estado inválido: 9'), 'estado inválido: 9');
  assert.equal(textoDeError(new SinRed('x')), mensajeDeError(new SinRed('x')));
});

test('el desafío de Cloudflare y la falta de respuesta sugieren cambiar de red o de servidor de la VPN', () => {
  assert.match(mensajeDeError(new Desafio('x')), /VPN/);
  assert.match(mensajeDeError(new SinRed('x')), /otro servidor de la VPN/);
});
