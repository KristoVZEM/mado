import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarUrlDeStream } from './url.ts';

test('acepta una URL https y la devuelve tal cual', () => {
  const url = 'https://cdn.test/engine/master.m3u8?t=abc&e=14400';
  assert.equal(validarUrlDeStream(url), url);
});

test('rechaza esquemas que mpv sabe abrir pero que no son una descarga https', () => {
  for (const url of ['http://x.test/v.mp4', 'file:///C:/secreto.txt', 'lavfi://color', 'javascript:alert(1)', 'ftp://x.test/v.mp4']) {
    assert.throws(() => validarUrlDeStream(url), /URL del stream/);
  }
});

test('rechaza espacios, tabulaciones y saltos de línea, incluso al principio o al final', () => {
  for (const url of [' https://x.test/v.mp4', 'https://x.test/v.mp4 ', '\thttps://x.test/v.mp4', 'https://x.test/v.mp4\n', 'https://x.test/a b.mp4', 'https://x.test/\u0000v.mp4']) {
    assert.throws(() => validarUrlDeStream(url), /URL del stream/);
  }
});

test('rechaza cadenas vacías, sin host o que no son URL, y valores que no son texto', () => {
  for (const url of ['', 'https://', 'no es una url', '//x.test/v.mp4']) {
    assert.throws(() => validarUrlDeStream(url), /URL del stream/);
  }
  assert.throws(() => validarUrlDeStream(42 as unknown as string), /URL del stream/);
});

test('el error no incluye la URL (puede llevar un token)', () => {
  try {
    validarUrlDeStream('http://x.test/v.mp4?t=SECRETO');
    assert.fail('debía lanzar');
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(!e.message.includes('SECRETO'));
  }
});
