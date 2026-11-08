import assert from 'node:assert/strict';
import { test } from 'node:test';
import { textoAviso, textoResultado, textoResumen } from './importar.ts';

const resumen = { total: 1990, series: 272, nuevos: 1500, existentes: 490, invalidos: 0, actuales: 12 };

test('textoResumen cuenta episodios, series, nuevos y existentes', () => {
  assert.equal(textoResumen(resumen), '1990 episodios de 272 series: 1500 nuevos, 490 ya estaban.');
});

test('textoResumen usa el singular y avisa de los omitidos', () => {
  const uno = { total: 1, series: 1, nuevos: 1, existentes: 0, invalidos: 0, actuales: 0 };
  assert.equal(textoResumen(uno), '1 episodio de 1 serie: 1 nuevo, 0 ya estaban.');
  assert.equal(
    textoResumen({ ...uno, existentes: 1, nuevos: 0, invalidos: 3 }),
    '1 episodio de 1 serie: 0 nuevos, 1 ya estaba; 3 omitidos por datos inválidos.',
  );
  assert.ok(textoResumen({ ...uno, invalidos: 1 }).endsWith('1 omitido por datos inválidos.'));
});

test('textoAviso de mezclar no habla de borrar', () => {
  const t = textoAviso('mezclar', resumen);
  assert.ok(t.includes('fecha más reciente'));
  assert.ok(t.includes('No se borra nada'));
});

test('textoAviso de reemplazar dice cuántos se borran y que hay copia', () => {
  const t = textoAviso('reemplazar', resumen);
  assert.ok(t.includes('12 episodios vistos'));
  assert.ok(t.includes('copia'));
  assert.ok(textoAviso('reemplazar', { ...resumen, actuales: 1 }).includes('1 episodio visto'));
  assert.ok(textoAviso('reemplazar', { ...resumen, actuales: 0 }).includes('No hay episodios vistos'));
});

test('textoResultado resume lo hecho', () => {
  assert.equal(
    textoResultado({ nuevos: 1500, actualizados: 490, invalidos: 0, copia: null }),
    'Importados 1500 episodios nuevos y 490 actualizados.',
  );
  assert.equal(
    textoResultado({ nuevos: 1, actualizados: 1, invalidos: 2, copia: 'C:/x.bak' }),
    'Importados 1 episodio nuevo y 1 actualizado; 2 omitidos. Copia previa de la base guardada.',
  );
});
