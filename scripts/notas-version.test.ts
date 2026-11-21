import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escribirSalida, notasDeVersion, versionDeEtiqueta } from './notas-version.ts';

const CHANGELOG = `# Cambios

Texto de cabecera.

## Cómo se numera

Algo que no es una versión.

## 0.14.0 — 2026-11-22

Mado salta intros.

### Nuevo

- **Saltar intro.** Un botón.
- Otra cosa.

## 0.13.0 — 2026-11-16

Mado tiene logo propio.

## 0.12.1 — 2026-11-15

Sin cambios de funciones.
`;

test('la versión de una etiqueta no lleva la v ni el sufijo de prueba', () => {
  assert.equal(versionDeEtiqueta('v0.14.0'), '0.14.0');
  assert.equal(versionDeEtiqueta('v0.14.0-prueba'), '0.14.0');
  assert.equal(versionDeEtiqueta('v1.2.3-rc.1'), '1.2.3');
  assert.equal(versionDeEtiqueta('0.9.0'), '0.9.0');
});

test('extrae la sección de la versión, sin su título y hasta la siguiente versión', () => {
  const notas = notasDeVersion(CHANGELOG, '0.14.0');
  assert.equal(
    notas,
    'Mado salta intros.\n\n### Nuevo\n\n- **Saltar intro.** Un botón.\n- Otra cosa.',
  );
});

test('la última sección llega hasta el final del archivo', () => {
  assert.equal(notasDeVersion(CHANGELOG, '0.12.1'), 'Sin cambios de funciones.');
});

test('una versión que no está, o que está vacía, da null', () => {
  assert.equal(notasDeVersion(CHANGELOG, '0.99.0'), null);
  assert.equal(notasDeVersion('## 0.1.0 — 2026-01-01\n\n## 0.0.9 — 2025-12-31\n\nAlgo.', '0.1.0'), null);
  assert.equal(notasDeVersion('', '0.1.0'), null);
});

test('0.1.0 no se confunde con 0.10.0 ni con 0.1.0-algo, y los saltos de línea de Windows valen', () => {
  const texto = '## 0.10.0 — 2026-02-01\r\n\r\nDiez.\r\n\r\n## 0.1.0 — 2026-01-01\r\n\r\nUno.\r\n';
  assert.equal(notasDeVersion(texto, '0.1.0'), 'Uno.');
  assert.equal(notasDeVersion(texto, '0.10.0'), 'Diez.');
});

test('el título de una versión sin fecha también cuenta', () => {
  assert.equal(notasDeVersion('## 0.2.0\n\nSin fecha.\n', '0.2.0'), 'Sin fecha.');
});

test('escribe la salida del paso con un delimitador que no aparece en el texto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mado-notas-'));
  try {
    const archivo = join(dir, 'salida');
    // Un texto que intenta cerrar el bloque con un delimitador cualquiera no puede romperlo.
    const notas = 'Línea 1\nEOF\nDELIM\nLínea 4';
    escribirSalida(archivo, 'cuerpo', notas);
    const salida = readFileSync(archivo, 'utf8');
    const [cabecera, ...resto] = salida.split('\n');
    const delimitador = cabecera.replace('cuerpo<<', '');
    assert.match(cabecera, /^cuerpo<<[0-9a-f]{16,}$/);
    assert.ok(!notas.includes(delimitador));
    assert.equal(resto.join('\n'), `${notas}\n${delimitador}\n`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escribirSalida añade al archivo, no lo pisa', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mado-notas-'));
  try {
    const archivo = join(dir, 'salida');
    writeFileSync(archivo, 'previa=1\n');
    escribirSalida(archivo, 'cuerpo', 'x');
    assert.ok(readFileSync(archivo, 'utf8').startsWith('previa=1\ncuerpo<<'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
