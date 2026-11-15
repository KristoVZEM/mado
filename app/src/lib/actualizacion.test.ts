import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIA_MS, actualizarAlAbrirDe, avisoDeVersion, claseDeError, debeComprobar, mensajeDeError, porcentaje } from './actualizacion.ts';

const AHORA = 1_800_000_000_000;
const base = { ahora: AHORA, ultimaMs: AHORA - 2 * DIA_MS, reproduciendo: false, activado: true };

test('con «Comprobar al abrir» apagado no se comprueba', () => {
  assert.equal(debeComprobar({ ...base, activado: false }), false);
});

test('con un episodio reproduciéndose se aplaza, aunque ya toque', () => {
  assert.equal(debeComprobar({ ...base, reproduciendo: true }), false);
});

test('la primera vez (sin comprobación anterior) toca', () => {
  assert.equal(debeComprobar({ ...base, ultimaMs: 0 }), true);
});

test('como mucho una comprobación al día', () => {
  assert.equal(debeComprobar({ ...base, ultimaMs: AHORA - 60 * 60 * 1000 }), false);
  assert.equal(debeComprobar({ ...base, ultimaMs: AHORA - (DIA_MS - 1) }), false);
  assert.equal(debeComprobar({ ...base, ultimaMs: AHORA - DIA_MS }), true);
  assert.equal(debeComprobar({ ...base, ultimaMs: AHORA - 3 * DIA_MS }), true);
});

test('si el reloj retrocedió (la última comprobación es futura) se comprueba en vez de esperar días', () => {
  assert.equal(debeComprobar({ ...base, ultimaMs: AHORA + 5 * DIA_MS }), true);
});

test('«Cuando no hay release todavía» y un fallo de red se distinguen del resto de errores', () => {
  assert.equal(claseDeError(new Error('Could not fetch a valid release JSON from the remote')), 'sin-release');
  assert.equal(claseDeError(new Error('error sending request for url (https://x/latest.json): dns error')), 'red');
  assert.equal(claseDeError('request failed: error trying to connect'), 'red');
  assert.equal(claseDeError(new Error('la firma no coincide')), 'otro');
  assert.equal(claseDeError(undefined), 'otro');
});

test('los mensajes no incluyen la URL ni el texto original del error', () => {
  const crudo = new Error('error sending request for url (https://github.com/x/latest.json?token=abc123): dns error');
  for (const e of [crudo, new Error('la firma no coincide: abc123')]) {
    const m = mensajeDeError(e);
    assert.doesNotMatch(m, /https?:|abc123|latest\.json/);
  }
  assert.match(mensajeDeError(crudo), /conexión/);
});

test('sin release publicada el mensaje es el de «al día», no el de un error', () => {
  assert.match(mensajeDeError(new Error('Could not fetch a valid release JSON from the remote')), /al día/);
});

test('el aviso nombra la versión; una versión rara no se cuela en la interfaz', () => {
  assert.equal(avisoDeVersion('0.12.0'), 'Mado 0.12.0 está lista.');
  assert.equal(avisoDeVersion('0.12.1-beta.2'), 'Mado 0.12.1-beta.2 está lista.');
  for (const rara of ['<img src=x onerror=alert(1)>', '', 'a'.repeat(40), '1.0 y más']) {
    assert.equal(avisoDeVersion(rara), 'Hay una versión nueva de Mado.');
  }
});

test('el porcentaje de la descarga se acota de 0 a 100 y es nulo si no se conoce el tamaño', () => {
  assert.equal(porcentaje(200, 50), 25);
  assert.equal(porcentaje(200, 0), 0);
  assert.equal(porcentaje(200, 250), 100);
  assert.equal(porcentaje(3, 1), 33);
  assert.equal(porcentaje(undefined, 10), null);
  assert.equal(porcentaje(0, 0), null);
});

test('«Comprobar al abrir» está activado salvo que se apague con un 0', () => {
  for (const v of [null, undefined, '', '1', ' 1 ', 'basura', '2']) assert.equal(actualizarAlAbrirDe(v), true, String(v));
  assert.equal(actualizarAlAbrirDe('0'), false);
  assert.equal(actualizarAlAbrirDe(' 0 '), false);
});
