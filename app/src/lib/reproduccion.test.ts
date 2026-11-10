import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HWDECS,
  REDIMENSIONES,
  hwdecDe,
  recordarServidorDe,
  redimensionDe,
  servidorGuardable,
  servidorPreferido,
  siguienteAutoDe,
} from './reproduccion.ts';

test('redimensión: por defecto ajustar, y lo inválido vuelve a ajustar', () => {
  assert.equal(redimensionDe(null), 0);
  assert.equal(redimensionDe('abc'), 0);
  assert.equal(redimensionDe('3'), 0);
  assert.equal(redimensionDe('1'), 1);
  assert.equal(redimensionDe('2'), 2);
});

test('cada redimensión traduce a las propiedades de mpv que se esperan', () => {
  const [ajustar, llenar, estirar] = REDIMENSIONES;
  assert.deepEqual([ajustar.mantenerProporcion, ajustar.panscan], [true, 0]);
  assert.deepEqual([llenar.mantenerProporcion, llenar.panscan], [true, 1]);
  assert.deepEqual([estirar.mantenerProporcion, estirar.panscan], [false, 0]);
});

test('hwdec: automática por defecto, y los nombres son los de mpv', () => {
  assert.equal(HWDECS[hwdecDe(null)].valor, 'auto-safe');
  assert.equal(HWDECS[hwdecDe('1')].valor, 'auto-copy');
  assert.equal(HWDECS[hwdecDe('2')].valor, 'no');
  assert.equal(HWDECS[hwdecDe('9')].valor, 'auto-safe');
});

test('pasar solo al siguiente episodio está activo salvo que se guarde 0', () => {
  assert.equal(siguienteAutoDe(null), true);
  assert.equal(siguienteAutoDe(''), true);
  assert.equal(siguienteAutoDe('x'), true);
  assert.equal(siguienteAutoDe('1'), true);
  assert.equal(siguienteAutoDe('0'), false);
});

test('recordar el servidor está apagado salvo que se guarde 1', () => {
  assert.equal(recordarServidorDe(null), false);
  assert.equal(recordarServidorDe('x'), false);
  assert.equal(recordarServidorDe('0'), false);
  assert.equal(recordarServidorDe('1'), true);
});

test('el servidor preferido solo existe con el ajuste activo y un texto no vacío', () => {
  assert.equal(servidorPreferido(false, 'HLS'), undefined);
  assert.equal(servidorPreferido(true, 'HLS'), 'HLS');
  assert.equal(servidorPreferido(true, '  Voe '), 'Voe');
  assert.equal(servidorPreferido(true, ''), undefined);
  assert.equal(servidorPreferido(true, '   '), undefined);
  assert.equal(servidorPreferido(true, null), undefined);
  assert.equal(servidorPreferido(true, undefined), undefined);
});

test('solo se guardan nombres de servidor que Rust aceptaría', () => {
  assert.equal(servidorGuardable('HLS'), true);
  assert.equal(servidorGuardable('MP4Upload'), true);
  assert.equal(servidorGuardable(undefined), false);
  assert.equal(servidorGuardable(''), false);
  assert.equal(servidorGuardable('a/b'), false);
  assert.equal(servidorGuardable('x'.repeat(33)), false);
});
