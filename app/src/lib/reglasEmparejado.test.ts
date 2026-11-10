import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reintentarSiCambiaronLasReglas, VERSION_REGLAS_EMPAREJADO, type DepsReglas } from './reglasEmparejado.ts';

function deps(version: number, ningunos = 3) {
  const llamadas: string[] = [];
  const d: DepsReglas = {
    version: async () => version,
    guardarVersion: async (n) => void llamadas.push(`guardar:${n}`),
    reintentarNingunos: async () => (llamadas.push('reintentar'), ningunos),
  };
  return { d, llamadas };
}

test('con una versión vieja reintenta los ninguno y guarda la versión actual, en ese orden', async () => {
  for (const vieja of [0, VERSION_REGLAS_EMPAREJADO - 1]) {
    const { d, llamadas } = deps(vieja);
    assert.equal(await reintentarSiCambiaronLasReglas(d), 3);
    assert.deepEqual(llamadas, ['reintentar', `guardar:${VERSION_REGLAS_EMPAREJADO}`]);
  }
});

test('con la versión al día no hace nada', async () => {
  for (const actual of [VERSION_REGLAS_EMPAREJADO, VERSION_REGLAS_EMPAREJADO + 1]) {
    const { d, llamadas } = deps(actual);
    assert.equal(await reintentarSiCambiaronLasReglas(d), null);
    assert.deepEqual(llamadas, []);
  }
});

test('si reintentar falla no guarda la versión (se vuelve a intentar al abrir) y no lanza', async () => {
  const llamadas: string[] = [];
  const r = await reintentarSiCambiaronLasReglas({
    version: async () => 0,
    guardarVersion: async () => void llamadas.push('guardar'),
    reintentarNingunos: async () => {
      throw new Error('disco');
    },
  });
  assert.equal(r, null);
  assert.deepEqual(llamadas, []);
});

test('si la versión no se puede leer, no toca nada', async () => {
  const { d, llamadas } = deps(0);
  const r = await reintentarSiCambiaronLasReglas({
    ...d,
    version: async () => {
      throw new Error('base');
    },
  });
  assert.equal(r, null);
  assert.deepEqual(llamadas, []);
});
