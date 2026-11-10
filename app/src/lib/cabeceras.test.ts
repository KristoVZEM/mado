import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabecerasMpv } from './cabeceras.ts';

test('une las cabeceras con comas para http-header-fields', () => {
  assert.equal(
    cabecerasMpv({ referer: 'https://a.test/', origin: 'https://a.test' }),
    'referer: https://a.test/,origin: https://a.test',
  );
});

test('sin cabeceras devuelve la cadena vacía', () => {
  assert.equal(cabecerasMpv({}), '');
});

test('rechaza un valor con coma, que mpv interpretaría como otra cabecera', () => {
  assert.throws(() => cabecerasMpv({ accept: 'a,b' }), /accept/);
});

test('rechaza nombres con coma o dos puntos y valores con saltos de línea', () => {
  assert.throws(() => cabecerasMpv({ 'a,b': 'x' }));
  assert.throws(() => cabecerasMpv({ 'a:b': 'x' }));
  assert.throws(() => cabecerasMpv({ a: 'x\r\nb: y' }));
});

test('rechaza barras invertidas: mpv las usa para escapar y podrían tragarse la coma separadora', () => {
  assert.throws(() => cabecerasMpv({ a: 'x\\' }), /a/);
  assert.throws(() => cabecerasMpv({ 'a\\b': 'x' }));
});

test('el error no incluye el valor de la cabecera (puede llevar un token)', () => {
  try {
    cabecerasMpv({ authorization: 'token,SECRETO' });
    assert.fail('debía lanzar');
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(!e.message.includes('SECRETO'));
    assert.ok(e.message.includes('authorization'));
  }
});
