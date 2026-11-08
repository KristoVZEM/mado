import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confianza, decidir, ordenar, UMBRAL_AUTO, type CandidatoAnilist } from './emparejar.ts';

const c = (
  anilistId: number,
  tituloRomaji: string,
  tituloIngles: string | null,
  sinonimos: string[],
  anio: number | null,
  episodios: number | null,
): CandidatoAnilist => ({ anilistId, tituloRomaji, tituloIngles, tituloNativo: null, sinonimos, anio, episodios });

const AOT = c(16498, 'Shingeki no Kyojin', 'Attack on Titan', ['Ataque a los Titanes'], 2013, 25);
const AOT2 = c(25777, 'Shingeki no Kyojin Season 2', 'Attack on Titan Season 2', [], 2017, 12);
const FRIEREN = c(
  154587,
  'Sousou no Frieren',
  'Frieren: Beyond Journey’s End',
  ['Frieren: Más allá del final del viaje', 'Frieren: Tras finalizar el viaje'],
  2023,
  28,
);
const FMA03 = c(121, 'Fullmetal Alchemist', null, [], 2003, 51);
const FMAB = c(5114, 'Fullmetal Alchemist: Brotherhood', null, ['Hagane no Renkinjutsushi: Fullmetal Alchemist'], 2009, 64);
const PELI = c(1, 'Kimi no Na wa.', 'Your Name.', ['Tu nombre'], 2016, 1);

test('un título exacto vincula solo, también si coincide con un sinónimo en español', () => {
  const a = decidir({ titulo: 'Shingeki no Kyojin', anio: 2013, episodios: 25 }, [AOT2, AOT]);
  assert.equal(a.tipo, 'auto');
  assert.equal(a.tipo === 'auto' && a.propuesta.candidato.anilistId, 16498);
  const b = decidir({ titulo: 'Ataque a los Titanes' }, [AOT2, AOT]);
  assert.equal(b.tipo === 'auto' && b.propuesta.candidato.anilistId, 16498);
  const f = decidir({ titulo: 'Frieren: Más allá del final del viaje' }, [FRIEREN]);
  assert.equal(f.tipo, 'auto');
});

test('la temporada se distingue por el número', () => {
  const d = decidir({ titulo: 'Shingeki no Kyojin 2' }, [AOT, AOT2]);
  assert.equal(d.tipo === 'auto' && d.propuesta.candidato.anilistId, 25777);
});

test('un título parcial queda como dudoso, no como vínculo firme', () => {
  const d = decidir({ titulo: 'Frieren' }, [FRIEREN]);
  assert.equal(d.tipo, 'dudoso');
  assert.ok(d.tipo === 'dudoso' && d.propuesta.confianza < UMBRAL_AUTO);
});

test('el año distinto de 2 o más impide el vínculo automático entre remakes', () => {
  const d = decidir({ titulo: 'Fullmetal Alchemist', anio: 2009, episodios: 51 }, [FMA03, FMAB]);
  assert.equal(d.tipo, 'dudoso');
  const bien = decidir({ titulo: 'Fullmetal Alchemist', anio: 2003, episodios: 51 }, [FMAB, FMA03]);
  assert.equal(bien.tipo === 'auto' && bien.propuesta.candidato.anilistId, 121);
});

test('nada parecido o sin candidatos es ninguno', () => {
  const d = decidir({ titulo: 'Spy x Family' }, [AOT, FRIEREN, PELI]);
  assert.equal(d.tipo, 'ninguno');
  assert.equal(decidir({ titulo: 'Zzzz' }, []).tipo, 'ninguno');
});

test('sin año ni episodios la confianza es solo el parecido, y siempre está entre 0 y 1', () => {
  assert.equal(confianza({ titulo: 'Kimi no Na wa' }, PELI), 1);
  for (const cand of [AOT, AOT2, FRIEREN, FMA03, FMAB, PELI]) {
    const v = confianza({ titulo: 'Fullmetal Alchemist', anio: 1990, episodios: 3 }, cand);
    assert.ok(v >= 0 && v <= 1);
  }
});

test('ordenar es estable: a igual confianza, el id más bajo primero', () => {
  const a = c(9, 'Igual', null, [], null, null);
  const b = c(3, 'Igual', null, [], null, null);
  assert.deepEqual(ordenar({ titulo: 'Igual' }, [a, b]).map((p) => p.candidato.anilistId), [3, 9]);
});
