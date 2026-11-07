import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desofuscarVoe, extraerOfuscado, extraerRedireccion } from './voe.ts';
import { ofuscarVoe, paginaRedireccionVoe, paginaVoe } from './voe.testutil.ts';
import { FuenteCambio } from './errors.ts';

// Vector independiente: generado con otro codificador (Python) y contrastado con el decodificador
// suelto que se usó contra la página real de Voe el 2026-11-07. Fija la receta y los marcadores.
const VECTOR_VOE =
  'CTq@$gHzj3pR^^k2GUkpo~@RynHmZ8%?E1V0HIq*~yrRt1Gm!!AEJ10mB#&TkyoyR1@$G3ylsJM^^6IHgapx~@1fHzkLA%?Ik8JGMy*~sH18nN=!!=';
const DATOS_VECTOR = { source: 'https://cdn.test/a.m3u8?t=abc', n: 7 };

test('desofuscarVoe deshace la ofuscación, incluidos los caracteres no ASCII', () => {
  const datos = { source: 'https://cdn.test/master.m3u8?t=abc&e=14400', title: 'ñandú', n: 7 };
  assert.deepEqual(desofuscarVoe(ofuscarVoe(datos)), datos);
});

test('desofuscarVoe lanza FuenteCambio con una cadena que no sigue la receta', () => {
  assert.throws(() => desofuscarVoe('hola mundo'), FuenteCambio);
  assert.throws(() => desofuscarVoe(''), FuenteCambio);
});

test('desofuscarVoe lanza FuenteCambio con una cadena truncada', () => {
  assert.throws(() => desofuscarVoe(ofuscarVoe('no es un objeto').slice(0, -4)), FuenteCambio);
});

test('extraerOfuscado devuelve la cadena del bloque JSON', () => {
  const html = paginaVoe({ source: 'https://cdn.test/a.m3u8' });
  assert.deepEqual(desofuscarVoe(extraerOfuscado(html)), { source: 'https://cdn.test/a.m3u8' });
});

test('extraerOfuscado lanza FuenteCambio sin bloque JSON o con otra forma', () => {
  assert.throws(() => extraerOfuscado('<html><body>nada</body></html>'), FuenteCambio);
  assert.throws(
    () => extraerOfuscado('<script type="application/json">{"a":1}</script>'),
    FuenteCambio,
  );
  assert.throws(
    () => extraerOfuscado('<script type="application/json">no es json</script>'),
    FuenteCambio,
  );
});

test('extraerRedireccion saca el destino de la página de voe.sx', () => {
  const html = paginaRedireccionVoe('https://espejo.test/e/abc123');
  assert.equal(extraerRedireccion(html), 'https://espejo.test/e/abc123');
});

test('extraerRedireccion lanza FuenteCambio si no hay destino https', () => {
  assert.throws(() => extraerRedireccion('<html>sin redirección</html>'), FuenteCambio);
  assert.throws(() => extraerRedireccion("<script>window.location.href = 'http://x.test/e/1'</script>"), FuenteCambio);
});

test('desofuscarVoe descifra un vector independiente de la implementación de pruebas', () => {
  assert.deepEqual(desofuscarVoe(VECTOR_VOE), DATOS_VECTOR);
});

test('el ayudante ofuscarVoe produce exactamente el vector independiente', () => {
  assert.equal(ofuscarVoe(DATOS_VECTOR), VECTOR_VOE);
});
