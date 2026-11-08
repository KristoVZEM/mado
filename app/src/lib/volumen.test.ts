import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOLUMEN_INICIAL, VOLUMEN_PASO, guardarVolumen, leerVolumen, limitarVolumen } from './volumen.ts';

function almacenFalso(inicial?: string) {
  const datos = new Map<string, string>();
  if (inicial !== undefined) datos.set('ukiku.volumen', inicial);
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
  };
}

test('el paso es de 5 y el volumen inicial es 100', () => {
  assert.equal(VOLUMEN_PASO, 5);
  assert.equal(VOLUMEN_INICIAL, 100);
});

test('limitarVolumen recorta a 0-100 y redondea', () => {
  assert.equal(limitarVolumen(-10), 0);
  assert.equal(limitarVolumen(150), 100);
  assert.equal(limitarVolumen(42.6), 43);
});

test('limitarVolumen da el volumen inicial con valores no finitos', () => {
  assert.equal(limitarVolumen(Number.NaN), VOLUMEN_INICIAL);
  assert.equal(limitarVolumen(Number.POSITIVE_INFINITY), VOLUMEN_INICIAL);
});

test('leerVolumen devuelve lo guardado, recortado', () => {
  assert.equal(leerVolumen(almacenFalso('35')), 35);
  assert.equal(leerVolumen(almacenFalso('900')), 100);
});

test('leerVolumen usa el inicial si no hay nada, es basura o no hay almacén', () => {
  assert.equal(leerVolumen(almacenFalso()), VOLUMEN_INICIAL);
  assert.equal(leerVolumen(almacenFalso('abc')), VOLUMEN_INICIAL);
  assert.equal(leerVolumen(almacenFalso('')), VOLUMEN_INICIAL);
  assert.equal(leerVolumen(undefined), VOLUMEN_INICIAL);
});

test('leerVolumen tolera un almacén que lanza', () => {
  const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => {} };
  assert.equal(leerVolumen(roto), VOLUMEN_INICIAL);
});

test('guardarVolumen guarda el valor recortado y tolera fallos', () => {
  const a = almacenFalso();
  guardarVolumen(a, 250);
  assert.equal(a.datos.get('ukiku.volumen'), '100');
  const roto = { getItem: () => null, setItem: () => { throw new Error('lleno'); } };
  assert.doesNotThrow(() => guardarVolumen(roto, 50));
  assert.doesNotThrow(() => guardarVolumen(undefined, 50));
});
