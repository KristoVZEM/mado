import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { descargar, sha256 } from './descargar-libmpv.ts';

const DATOS = Buffer.from('contenido de una biblioteca de prueba');
const HASH = createHash('sha256').update(DATOS).digest('hex');
const URL = 'https://ejemplo.test/lib.dll.gz';

function carpeta(): string {
  return mkdtempSync(join(tmpdir(), 'mado-libmpv-'));
}

function respuesta(cuerpo: Uint8Array, estado = 200): typeof fetch {
  return (async () => new Response(cuerpo, { status: estado })) as typeof fetch;
}

test('sha256 devuelve el hash en hexadecimal', () => {
  assert.equal(sha256(DATOS), HASH);
});

test('descarga, descomprime, verifica el hash y deja el archivo', async () => {
  const dir = carpeta();
  const r = await descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(gzipSync(DATOS)));
  assert.equal(r, 'descargado');
  assert.deepEqual(readFileSync(join(dir, 'lib.dll')), DATOS);
  assert.deepEqual(readdirSync(dir), ['lib.dll'], 'no queda ningún temporal');
  rmSync(dir, { recursive: true });
});

test('crea la carpeta de destino si no existe', async () => {
  const dir = join(carpeta(), 'a', 'b');
  await descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(gzipSync(DATOS)));
  assert.ok(existsSync(join(dir, 'lib.dll')));
});

test('omite la descarga si el archivo ya tiene el hash esperado', async () => {
  const dir = carpeta();
  writeFileSync(join(dir, 'lib.dll'), DATOS);
  let llamadas = 0;
  const pedir = (async () => {
    llamadas++;
    return new Response('x');
  }) as typeof fetch;
  const r = await descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, pedir);
  assert.equal(r, 'omitido');
  assert.equal(llamadas, 0);
});

test('reemplaza un archivo que existe pero con otro contenido', async () => {
  const dir = carpeta();
  writeFileSync(join(dir, 'lib.dll'), 'versión vieja');
  const r = await descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(gzipSync(DATOS)));
  assert.equal(r, 'descargado');
  assert.deepEqual(readFileSync(join(dir, 'lib.dll')), DATOS);
});

test('un hash distinto falla y no escribe nada ni deja temporales', async () => {
  const dir = carpeta();
  const otro = gzipSync(Buffer.from('contenido alterado'));
  await assert.rejects(
    descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(otro)),
    /SHA-256/,
  );
  assert.deepEqual(readdirSync(dir), []);
});

test('un hash distinto no pisa el archivo que ya había', async () => {
  const dir = carpeta();
  writeFileSync(join(dir, 'lib.dll'), 'versión vieja');
  await assert.rejects(
    descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(gzipSync(Buffer.from('alterado')))),
    /SHA-256/,
  );
  assert.equal(readFileSync(join(dir, 'lib.dll'), 'utf8'), 'versión vieja');
});

test('una respuesta de error del servidor falla con el estado', async () => {
  const dir = carpeta();
  await assert.rejects(
    descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(new Uint8Array(), 404)),
    /404/,
  );
  assert.deepEqual(readdirSync(dir), []);
});

test('algo que no es gzip falla con un mensaje claro', async () => {
  const dir = carpeta();
  await assert.rejects(
    descargar({ nombre: 'lib.dll', sha256: HASH, url: URL }, dir, respuesta(Buffer.from('esto no es gzip'))),
    /gzip/,
  );
  assert.deepEqual(readdirSync(dir), []);
});
