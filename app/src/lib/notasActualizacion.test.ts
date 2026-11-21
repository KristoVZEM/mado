import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bloquesDeNotas, MAX_NOTAS, notasSeguras } from './notasActualizacion.ts';

test('sin notas, o con algo que no es texto, no hay nada que mostrar', () => {
  for (const v of [undefined, null, 42, {}, [], '', '   \n  \n']) assert.equal(notasSeguras(v), null);
});

test('limpia los saltos de línea de Windows, los caracteres de control (el tabulador pasa a espacio) y los bordes', () => {
  assert.equal(notasSeguras('  Uno\r\nDos\u0000\u0007 \t fin  \r\n'), 'Uno\nDos   fin');
});

test('recorta a MAX_NOTAS y avisa con unos puntos suspensivos, mejor en un salto de línea', () => {
  assert.equal(MAX_NOTAS, 4000);
  const largo = Array.from({ length: 600 }, (_, i) => `Línea ${i}`).join('\n');
  const r = notasSeguras(largo)!;
  assert.ok(r.length <= MAX_NOTAS + 1, String(r.length));
  assert.ok(r.endsWith('…'));
  assert.ok(!r.slice(0, -1).endsWith(' '));
  // Cortó en una línea entera: lo último antes de los puntos es una línea completa.
  assert.match(r.slice(0, -1).split('\n').at(-1)!, /^Línea \d+$/);
  // Un texto sin saltos de línea también se corta.
  assert.equal(notasSeguras('x'.repeat(MAX_NOTAS + 500))!.length, MAX_NOTAS + 1);
});

test('un texto que cabe se queda tal cual', () => {
  assert.equal(notasSeguras('Corto.'), 'Corto.');
});

test('títulos, viñetas y párrafos', () => {
  const b = bloquesDeNotas('Mado salta intros.\n\n### Nuevo\n\n- Uno.\n- Dos.\n\n### Cambia\n\n* Tres.');
  assert.deepEqual(b.map((x) => x.tipo), ['parrafo', 'titulo', 'item', 'item', 'titulo', 'item']);
  assert.deepEqual(b[1], { tipo: 'titulo', texto: 'Nuevo' });
  assert.deepEqual(b[2], { tipo: 'item', partes: [{ texto: 'Uno.', negrita: false }] });
});

test('una viñeta o un párrafo que sigue en la línea de abajo es el mismo bloque', () => {
  const b = bloquesDeNotas('- **Nuevo logo.** Sustituye al icono\n  por defecto de Tauri.\n- Otra.\n\nSin cambios de funciones: se\npublica para probar.');
  assert.equal(b.length, 3);
  assert.deepEqual(b[0], {
    tipo: 'item',
    partes: [
      { texto: 'Nuevo logo.', negrita: true },
      { texto: ' Sustituye al icono por defecto de Tauri.', negrita: false },
    ],
  });
  assert.deepEqual(b[2], { tipo: 'parrafo', partes: [{ texto: 'Sin cambios de funciones: se publica para probar.', negrita: false }] });
});

test('el énfasis se reduce a texto: negrita sí, cursiva, código y enlaces no', () => {
  const [b] = bloquesDeNotas('- **Saltar** intro con `AniSkip`, *opcional*, ver [la guía](https://ejemplo.test/x).');
  assert.equal(b.tipo, 'item');
  assert.deepEqual((b as { partes: unknown[] }).partes, [
    { texto: 'Saltar', negrita: true },
    { texto: ' intro con AniSkip, opcional, ver la guía.', negrita: false },
  ]);
});

test('el HTML y las direcciones se quedan como texto, nunca se interpretan', () => {
  const [b] = bloquesDeNotas('<img src=x onerror=alert(1)> y <script>mal()</script> en https://malo.test');
  assert.equal(b.tipo, 'parrafo');
  const texto = (b as { partes: Array<{ texto: string }> }).partes.map((p) => p.texto).join('');
  assert.equal(texto, '<img src=x onerror=alert(1)> y <script>mal()</script> en https://malo.test');
});

test('negritas sin cerrar no rompen nada', () => {
  const [b] = bloquesDeNotas('- **sin cerrar y más texto');
  assert.deepEqual((b as { partes: unknown[] }).partes, [{ texto: '**sin cerrar y más texto', negrita: false }]);
});

test('sin texto no hay bloques', () => {
  assert.deepEqual(bloquesDeNotas(''), []);
  assert.deepEqual(bloquesDeNotas('\n\n  \n'), []);
});
