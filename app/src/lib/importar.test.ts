import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineasResumen, textoAviso, textoHistorial, textoLista, textoResultado } from './importar.ts';

const historial = { total: 1990, series: 272, nuevos: 1500, existentes: 490, invalidos: 0, actuales: 12 };
const siguiendo = { total: 201, nuevos: 150, existentes: 51, invalidos: 2, actuales: 51 };
const favoritos = { total: 0, nuevos: 0, existentes: 0, invalidos: 0, actuales: 3 };

test('textoHistorial cuenta episodios, series, nuevos y existentes', () => {
  assert.equal(textoHistorial(historial), 'Historial: 1990 episodios de 272 series: 1500 nuevos, 490 ya estaban.');
});

test('textoHistorial usa el singular y avisa de los omitidos', () => {
  const uno = { total: 1, series: 1, nuevos: 1, existentes: 0, invalidos: 0, actuales: 0 };
  assert.equal(textoHistorial(uno), 'Historial: 1 episodio de 1 serie: 1 nuevo, 0 ya estaban.');
  assert.equal(
    textoHistorial({ ...uno, nuevos: 0, existentes: 1, invalidos: 3 }),
    'Historial: 1 episodio de 1 serie: 0 nuevos, 1 ya estaba; 3 omitidos por datos inválidos.',
  );
  assert.ok(textoHistorial({ ...uno, invalidos: 1 }).endsWith('1 omitido por datos inválidos.'));
});

test('textoLista cuenta series y avisa de los omitidos', () => {
  assert.equal(
    textoLista('Siguiendo', siguiendo),
    'Siguiendo: 201 series: 150 nuevas, 51 ya estaban; 2 omitidos por datos inválidos.',
  );
  assert.equal(
    textoLista('Favoritos', { total: 1, nuevos: 1, existentes: 0, invalidos: 0, actuales: 0 }),
    'Favoritos: 1 serie: 1 nueva, 0 ya estaban.',
  );
});

test('textoLista con un archivo vacío lo dice', () => {
  assert.equal(textoLista('Favoritos', favoritos), 'Favoritos: el archivo está vacío.');
});

test('lineasResumen da una línea por archivo presente y otra con los ausentes', () => {
  assert.deepEqual(lineasResumen({ historial, siguiendo, favoritos: null, ausentes: ['favs'] }), [
    'Historial: 1990 episodios de 272 series: 1500 nuevos, 490 ya estaban.',
    'Siguiendo: 201 series: 150 nuevas, 51 ya estaban; 2 omitidos por datos inválidos.',
    'No están en la carpeta (no se tocan): favs.',
  ]);
  assert.deepEqual(lineasResumen({ historial: null, siguiendo: null, favoritos, ausentes: [] }), [
    'Favoritos: el archivo está vacío.',
  ]);
});

test('textoAviso de mezclar no habla de borrar', () => {
  const t = textoAviso('mezclar', { historial, siguiendo, favoritos, ausentes: [] });
  assert.ok(t.includes('fecha más reciente'));
  assert.ok(t.includes('manda la copia'));
  assert.ok(t.includes('No se borra nada'));
  assert.equal(
    t,
    'Historial: se añaden los episodios nuevos y, si uno ya estaba, se conserva la fecha más reciente. ' +
      'Siguiendo y favoritos: manda la copia. No se borra nada.',
  );
  assert.equal(
    textoAviso('mezclar', { historial: null, siguiendo, favoritos: null, ausentes: ['history', 'favs'] }),
    'Siguiendo: manda la copia. No se borra nada.',
  );
});

test('textoAviso de reemplazar cuenta lo que se borra de cada archivo presente y avisa de la copia', () => {
  assert.equal(
    textoAviso('reemplazar', { historial, siguiendo, favoritos, ausentes: [] }),
    'Se borra lo que hay ahora de cada archivo presente (12 episodios vistos, 51 series en siguiendo y 3 favoritos) ' +
      'y se carga lo de la copia. Lo que no está en la carpeta no se toca. Antes se guarda una copia de la base.',
  );
  const solo = textoAviso('reemplazar', {
    historial: null,
    siguiendo: { ...siguiendo, actuales: 1 },
    favoritos: null,
    ausentes: ['history', 'favs'],
  });
  assert.ok(solo.includes('(1 serie en siguiendo)'), solo);
  assert.ok(!solo.includes('episodio'), solo);
});

test('textoResultado resume cada archivo y la copia', () => {
  assert.equal(
    textoResultado({
      historial: { nuevos: 1500, actualizados: 490, invalidos: 0 },
      siguiendo: null,
      favoritos: null,
      copia: null,
    }),
    'Historial: 1500 episodios nuevos y 490 actualizados.',
  );
  assert.equal(
    textoResultado({
      historial: { nuevos: 1, actualizados: 1, invalidos: 2 },
      siguiendo: { nuevos: 1, actualizados: 0, invalidos: 0 },
      favoritos: { nuevos: 0, actualizados: 1, invalidos: 0 },
      copia: 'C:/x.bak',
    }),
    'Historial: 1 episodio nuevo y 1 actualizado; 2 omitidos. Siguiendo: 1 serie nueva y 0 actualizadas. ' +
      'Favoritos: 0 favoritos nuevos y 1 actualizado. Copia previa de la base guardada.',
  );
});
