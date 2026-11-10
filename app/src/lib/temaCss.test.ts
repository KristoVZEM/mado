import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contraste } from './apariencia.ts';

const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

/** Variables `--x: #rrggbb;` del primer bloque que empieza por `selector {`. */
function variables(selector: string): Record<string, string> {
  const ini = css.indexOf(`${selector} {`);
  assert.ok(ini >= 0, `no hay un bloque «${selector}»`);
  const bloque = css.slice(ini, css.indexOf('}', ini));
  const v: Record<string, string> = {};
  for (const m of bloque.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) v[m[1]] = m[2];
  return v;
}

const oscuro = variables(':root,\n.zona-oscura'.replace('\n', css.includes('\r\n') ? '\r\n' : '\n'));
const claro = variables(":root[data-tema='claro']");

const PARES: [string, string][] = [
  ['texto', 'fondo'],
  ['texto', 'superficie'],
  ['texto', 'superficie-2'],
  ['texto-suave', 'fondo'],
  ['texto-suave', 'superficie'],
  ['boton-claro-texto', 'boton-claro'],
  ['error', 'fondo'],
];

for (const [nombre, v] of [['oscuro', oscuro], ['claro', claro]] as const) {
  test(`tema ${nombre}: el texto se lee sobre cada fondo (4,5:1)`, () => {
    for (const [a, b] of PARES) {
      assert.ok(v[a] && v[b], `faltan --${a} o --${b}`);
      const c = contraste(v[a], v[b]);
      assert.ok(c >= 4.5, `--${a} sobre --${b}: ${c.toFixed(2)}`);
    }
  });
}

test('el anillo de foco se distingue del fondo en los dos temas (3:1)', () => {
  assert.ok(contraste(oscuro.anillo, oscuro.fondo) >= 3);
  assert.ok(contraste(claro.anillo, claro.fondo) >= 3);
});
