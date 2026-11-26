import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIN_FILTROS } from './bibliotecaVista.ts';
import { ev } from '../pruebas/entradas.ts';
import { estadoVacioVista, haceCuanto, lineaFiltros, subtituloTarjeta, textoNuevos, textoResumen } from './bibliotecaTextos.ts';

const AHORA = new Date(2026, 10, 26, 18, 0).getTime();
const dias = (n: number, hora = 12) => new Date(2026, 10, 26 - n, hora).getTime();

test('haceCuanto por día local y luego semanas, meses y años', () => {
  assert.equal(haceCuanto(dias(0, 1), AHORA), 'hoy');
  assert.equal(haceCuanto(dias(1, 23), AHORA), 'ayer');
  assert.equal(haceCuanto(dias(2), AHORA), 'hace 2 días');
  assert.equal(haceCuanto(dias(13), AHORA), 'hace 13 días');
  assert.equal(haceCuanto(dias(14), AHORA), 'hace 2 sem.');
  assert.equal(haceCuanto(dias(62), AHORA), 'hace 8 sem.');
  assert.equal(haceCuanto(dias(63), AHORA), 'hace 2 meses');
  assert.equal(haceCuanto(dias(800), AHORA), 'hace 2 años');
  assert.equal(haceCuanto(AHORA + 60_000, AHORA), 'hoy'); // reloj adelantado: no «hace -1 días»
});

test('subtítulo: episodio con total y fecha; sin total; sin historial', () => {
  assert.equal(subtituloTarjeta(ev(1, 'a', { ultimoEpisodio: 5, total: 12, vistoEn: dias(1) }), false, AHORA), 'Ep. 5 de 12 · ayer');
  assert.equal(subtituloTarjeta(ev(1, 'a', { ultimoEpisodio: 5, vistoEn: dias(1) }), false, AHORA), 'Ep. 5 · ayer');
  assert.equal(subtituloTarjeta(ev(1, 'a', { vistoEn: dias(3) }), false, AHORA), 'hace 3 días');
  assert.equal(subtituloTarjeta(ev(1, 'a'), false, AHORA), '');
});

test('subtítulo en Todas: el estado en lugar de la fecha', () => {
  assert.equal(subtituloTarjeta(ev(1, 'a', { estado: 1, ultimoEpisodio: 5, total: 12, vistoEn: dias(1) }), true, AHORA), 'Viendo · Ep. 5 de 12');
  assert.equal(subtituloTarjeta(ev(1, 'a', { estado: null }), true, AHORA), 'Sin estado');
});

test('resumen, nuevos y línea de filtros con singular y plural', () => {
  assert.equal(textoResumen(112, 71), '112 series · 71 viendo');
  assert.equal(textoResumen(1, 0), '1 serie · 0 viendo');
  assert.equal(textoNuevos(4), '4 con episodios nuevos');
  assert.equal(textoNuevos(1), '1 con episodio nuevo');
  assert.equal(lineaFiltros(23, 71), '23 de 71 series');
  assert.equal(lineaFiltros(0, 1), '0 de 1 serie');
});

test('estados vacíos: biblioteca, pestaña, favoritos y filtros', () => {
  assert.deepEqual(estadoVacioVista('todos', SIN_FILTROS, 0, 0).acciones, ['catalogo', 'ajustes']);
  assert.equal(estadoVacioVista('todos', SIN_FILTROS, 0, 0).titulo, 'Tu biblioteca está vacía');
  const pestana = estadoVacioVista('pausado', SIN_FILTROS, 10, 0);
  assert.equal(pestana.titulo, 'No hay series en «Pausado»');
  assert.deepEqual(pestana.acciones, ['catalogo']);
  const favs = estadoVacioVista('viendo', { ...SIN_FILTROS, soloFavoritos: true }, 10, 4);
  assert.equal(favs.titulo, 'No tienes favoritos en «Viendo»');
  assert.deepEqual(favs.acciones, ['quitarFiltros']);
  assert.equal(estadoVacioVista('todos', { ...SIN_FILTROS, soloFavoritos: true }, 10, 10).titulo, 'Sin favoritos todavía');
  const nada = estadoVacioVista('viendo', { ...SIN_FILTROS, texto: 'zzz' }, 10, 4);
  assert.equal(nada.titulo, 'Ninguna serie coincide');
  assert.deepEqual(nada.acciones, ['quitarFiltros']);
});
