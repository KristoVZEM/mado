import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EntradaEmision } from './datos.ts';
import {
  agruparAgenda,
  debeRefrescarAgenda,
  diasDeSemana,
  filtrarSigues,
  horaLocal,
  inicioDeSemana,
  titulosParaBuscar,
} from './emision.ts';

// Fechas locales: no dependen de la zona horaria de la máquina. El 9 de noviembre de 2026 es lunes.
const local = (m: number, d: number, h = 0, min = 0) => new Date(2026, m, d, h, min).getTime();
const seg = (ms: number) => ms / 1000;

const entrada = (anilistId: number, emiteEn: number, estado: number | null = null): EntradaEmision => ({
  anilistId,
  episodio: 1,
  emiteEn,
  tituloRomaji: `Obra ${anilistId}`,
  tituloIngles: null,
  portada: null,
  banner: null,
  formato: null,
  sinonimos: [],
  aid: null,
  slug: null,
  tituloSerie: null,
  estado,
});

test('inicioDeSemana es el lunes a las 00:00 local, también en domingo y en cambio de mes', () => {
  const lunes = seg(local(10, 9));
  assert.equal(inicioDeSemana(local(10, 11, 15, 30)), lunes); // miércoles
  assert.equal(inicioDeSemana(local(10, 15, 23, 59)), lunes); // domingo
  assert.equal(inicioDeSemana(local(10, 9)), lunes); // el propio lunes a medianoche
  assert.equal(inicioDeSemana(local(10, 1, 12)), seg(local(9, 26))); // domingo 1 nov -> lunes 26 oct
});

test('diasDeSemana da 7 días contiguos de lunes a domingo con su etiqueta', () => {
  const dias = diasDeSemana(seg(local(10, 9)));
  assert.equal(dias.length, 7);
  assert.equal(dias[0]?.etiqueta, 'Lun 9');
  assert.equal(dias[6]?.etiqueta, 'Dom 15');
  for (let i = 0; i < 6; i++) assert.equal(dias[i]!.hastaS, dias[i + 1]!.desdeS);
  assert.equal(dias[6]!.hastaS, seg(local(10, 16)));
});

test('agruparAgenda reparte por día, ordena por hora y descarta lo que cae fuera de la semana', () => {
  const inicio = seg(local(10, 9));
  const g = agruparAgenda(
    [
      entrada(1, seg(local(10, 9, 18, 30))),
      entrada(2, seg(local(10, 9, 9, 0))),
      entrada(3, seg(local(10, 15, 23, 59))), // domingo, último minuto
      entrada(4, seg(local(10, 16, 0, 0))), // lunes siguiente: fuera
      entrada(5, seg(local(10, 8, 23, 59))), // domingo anterior: fuera
    ],
    inicio,
  );
  assert.equal(g.length, 7);
  assert.deepEqual(g[0]!.map((e) => e.anilistId), [2, 1]);
  assert.deepEqual(g[6]!.map((e) => e.anilistId), [3]);
  assert.equal(g.flat().length, 3);
});

test('filtrarSigues deja solo las series en estado Viendo', () => {
  const todas = [entrada(1, 1, 1), entrada(2, 2, 3), entrada(3, 3, null)];
  assert.deepEqual(filtrarSigues(todas, true).map((e) => e.anilistId), [1]);
  assert.equal(filtrarSigues(todas, false).length, 3);
});

test('horaLocal usa 24 horas con ceros', () => {
  assert.equal(horaLocal(seg(local(10, 9, 9, 5))), '09:05');
  assert.equal(horaLocal(seg(local(10, 9, 18, 30))), '18:30');
});

test('debeRefrescarAgenda: nunca cargada o con más de 3 horas', () => {
  const H = 60 * 60 * 1000;
  assert.equal(debeRefrescarAgenda(null, 10 * H), true);
  assert.equal(debeRefrescarAgenda(10 * H - 3 * H - 1, 10 * H), true);
  assert.equal(debeRefrescarAgenda(10 * H - 2 * H, 10 * H), false);
});

test('titulosParaBuscar: romaji, inglés y alias latinos sin repetir y con tope', () => {
  const e = {
    ...entrada(1, 0),
    tituloRomaji: 'Maomao no Hitorigoto 3rd Season',
    tituloIngles: null,
    sinonimos: [
      'Kusuriya no Hitorigoto 3rd Season Mini Anime',
      '薬屋のひとりごと 第3期 ミニアニメ',
      'The Apothecary Diaries Season 3 Mini Anime',
      'Maomao no Hitorigoto 3rd Season',
      'Otro alias',
      'Y otro más',
    ],
  };
  assert.deepEqual(titulosParaBuscar(e), [
    'Maomao no Hitorigoto 3rd Season',
    'Kusuriya no Hitorigoto 3rd Season Mini Anime',
    'The Apothecary Diaries Season 3 Mini Anime',
    'Otro alias',
  ]);
  assert.deepEqual(titulosParaBuscar({ ...entrada(2, 0), tituloIngles: 'English', sinonimos: [] }), ['Obra 2', 'English']);
});
