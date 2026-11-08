import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntradaHistorial } from './datos.ts';
import { agruparPorDia } from './historial.ts';

const en = (aid: number, vistoEn: number): EntradaHistorial => ({ aid, slug: `s${aid}`, titulo: `S${aid}`, numero: 1, vistoEn });
// Fechas locales: no dependen de la zona horaria de la máquina.
const AHORA = new Date(2026, 10, 8, 15, 0).getTime();
const hoyManana = new Date(2026, 10, 8, 9, 30).getTime();
const ayerNoche = new Date(2026, 10, 7, 23, 59).getTime();
const antiguo = new Date(2026, 9, 1, 12, 0).getTime();

test('agrupa en Hoy, Ayer y una fecha, conservando el orden', () => {
  const g = agruparPorDia([en(1, hoyManana), en(2, hoyManana - 1000), en(3, ayerNoche), en(4, antiguo)], AHORA);
  assert.deepEqual(g.map((x) => x.etiqueta).slice(0, 2), ['Hoy', 'Ayer']);
  assert.deepEqual(g.map((x) => x.entradas.map((e) => e.aid)), [[1, 2], [3], [4]]);
  assert.notEqual(g[2]?.etiqueta, 'Hoy');
  assert.notEqual(g[2]?.etiqueta, 'Ayer');
  assert.ok((g[2]?.etiqueta ?? '').length > 0);
});

test('sin entradas no hay grupos', () => {
  assert.deepEqual(agruparPorDia([], AHORA), []);
});

test('el mismo día del mes en meses distintos no se mezcla', () => {
  const g = agruparPorDia(
    [en(1, new Date(2026, 9, 8, 10, 0).getTime()), en(2, new Date(2026, 8, 8, 10, 0).getTime())],
    AHORA,
  );
  assert.equal(g.length, 2);
});
