import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoParaRegistro } from './registro.ts';

test('textoParaRegistro une textos y objetos', () => {
  assert.equal(textoParaRegistro(['cierre de la ventana:', { codigo: 3 }]), 'cierre de la ventana: {"codigo":3}');
});

test('textoParaRegistro anota nombre, mensaje y pila de un error, sin repetir la cabecera', () => {
  const e = new TypeError('no va');
  e.stack = 'TypeError: no va\n    at f (app.js:1:2)';
  assert.equal(textoParaRegistro([e]), 'TypeError: no va\n    at f (app.js:1:2)');
  e.stack = '    at g (app.js:3:4)';
  assert.equal(textoParaRegistro([e]), 'TypeError: no va\n    at g (app.js:3:4)');
});

test('textoParaRegistro no anota la causa de un error', () => {
  const e = new Error('sin respuesta', { cause: new Error('https://x.test/master.m3u8?t=SECRETO') });
  e.stack = undefined;
  assert.equal(textoParaRegistro([e]), 'Error: sin respuesta');
});

test('textoParaRegistro quita el query y el fragmento de las URL', () => {
  assert.equal(
    textoParaRegistro(['fallo en https://cdn.test/v/master.m3u8?t=SECRETO&e=14400 y https://a.test/b#frag']),
    'fallo en https://cdn.test/v/master.m3u8 y https://a.test/b',
  );
  assert.ok(!textoParaRegistro([new Error('GET https://a.test/x?token=abc falló')]).includes('abc'));
});

test('textoParaRegistro aguanta valores que no se pueden serializar', () => {
  const ciclo: Record<string, unknown> = {};
  ciclo.yo = ciclo;
  assert.equal(textoParaRegistro([ciclo, undefined]), '[object Object] undefined');
});

test('textoParaRegistro recorta los textos enormes', () => {
  const t = textoParaRegistro(['x'.repeat(10_000)]);
  assert.ok(t.length < 4100);
  assert.ok(t.endsWith('(recortado)'));
});
