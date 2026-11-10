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
const KUS1 = c(139, 'Kusuriya no Hitorigoto', 'The Apothecary Diaries', [], 2023, 24);
const KUS2 = c(176496, 'Kusuriya no Hitorigoto 2nd Season', 'The Apothecary Diaries Season 2', [], 2025, 24);
const KUS3 = c(195516, 'Kusuriya no Hitorigoto 3rd Season', 'The Apothecary Diaries Season 3', [], 2026, null);
const STEINS = c(9253, 'Steins;Gate', null, [], 2011, 24);
const STEINS0 = c(30484, 'Steins;Gate 0', null, [], 2018, 23);
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

test('la temporada con numeral romano no se confunde con la primera', () => {
  const OVL = c(20832, 'Overlord', null, [], 2015, 13);
  const OVL3 = c(35073, 'Overlord III', null, [], 2018, 13);
  const OVL4 = c(133844, 'Overlord IV', null, [], 2022, 13);
  assert.equal(decidir({ titulo: 'Overlord' }, [OVL4, OVL3, OVL]).tipo === 'auto', true);
  const d = decidir({ titulo: 'Overlord' }, [OVL4, OVL3]);
  assert.notEqual(d.tipo, 'auto', 'sin la primera temporada, las otras no se vinculan solas');
  const iv = decidir({ titulo: 'Overlord IV' }, [OVL, OVL3, OVL4]);
  assert.equal(iv.tipo === 'auto' && iv.propuesta.candidato.anilistId, 133844);
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

test('una temporada hermana no se vincula sola aunque el título sea casi igual', () => {
  // Antes puntuaba 0,91 / 0,88: por encima del umbral automático.
  assert.notEqual(decidir({ titulo: 'Kusuriya no Hitorigoto' }, [KUS3]).tipo, 'auto');
  assert.notEqual(decidir({ titulo: 'Kusuriya no Hitorigoto 2nd Season' }, [KUS3]).tipo, 'auto');
  assert.notEqual(decidir({ titulo: 'Kusuriya no Hitorigoto 3rd Season' }, [KUS1]).tipo, 'auto');
  assert.notEqual(decidir({ titulo: 'Steins;Gate' }, [STEINS0]).tipo, 'auto');
});

test('entre varias temporadas gana la que coincide', () => {
  const todas = [KUS3, KUS2, KUS1];
  const id = (t: string) => {
    const d = decidir({ titulo: t }, todas);
    return d.tipo === 'auto' ? d.propuesta.candidato.anilistId : d.tipo;
  };
  assert.equal(id('Kusuriya no Hitorigoto'), 139);
  assert.equal(id('Kusuriya no Hitorigoto 2nd Season'), 176496);
  assert.equal(id('Kusuriya no Hitorigoto 3rd Season'), 195516);
  assert.equal(id('The Apothecary Diaries Season 3'), 195516);
  assert.equal(decidir({ titulo: 'Steins;Gate 0' }, [STEINS, STEINS0]).tipo === 'auto' && 30484, 30484);
});

const KYOURAN = c(
  200001,
  'Kyouran Reijou Nia Liston',
  'Nia Liston: The Merciless Maiden',
  [],
  2026,
  null,
);
const AOASHI2 = c(200002, 'Aoashi 2nd Season', 'Aoashi Season 2', [], 2025, null);
const AOASHI1 = c(200003, 'Aoashi', null, [], 2022, 24);
const HOTARU_MINI = c(200004, 'Hotaru no Yomeiri: Choitashi', null, ['Hotaru no Yomeiri Mini Anime'], 2026, null);

test('el título del sitio con un subtítulo largo detrás se empareja con el título corto de AniList', () => {
  const sitio =
    'Kyouran Reijou Nia Liston: Byoujaku Reijou ni Tensei shita Kamigoroshi no Bujin no Karei Naru Musouroku';
  assert.ok(confianza({ titulo: sitio }, KYOURAN) >= UMBRAL_AUTO);
});

test('«Ao Ashi Season 2» del sitio es «Aoashi 2nd Season» de AniList, y no la primera temporada', () => {
  assert.ok(confianza({ titulo: 'Ao Ashi Season 2' }, AOASHI2) >= UMBRAL_AUTO);
  assert.ok(confianza({ titulo: 'Ao Ashi Season 2' }, AOASHI1) < UMBRAL_AUTO);
  assert.ok(confianza({ titulo: 'Ao Ashi' }, AOASHI1) >= UMBRAL_AUTO);
  assert.ok(confianza({ titulo: 'Ao Ashi' }, AOASHI2) < UMBRAL_AUTO);
});

test('la serie madre del sitio no se toma por el spin-off de AniList, ni la temporada nueva por la anterior', () => {
  assert.ok(confianza({ titulo: 'Hotaru no Yomeiri' }, HOTARU_MINI) < UMBRAL_AUTO);
  // El subtítulo largo no debe absorber una temporada numerada: «… 2» sigue siendo otra obra que «…».
  assert.ok(confianza({ titulo: 'Kyouran Reijou Nia Liston 2' }, KYOURAN) < UMBRAL_AUTO);
});

test('«Ranma ½ (2024) 3rd Season» del sitio es «Ranma 1/2 (2024) 3rd Season» de AniList', () => {
  const ranma = c(200005, 'Ranma 1/2 (2024) 3rd Season', 'Ranma1/2 (2024) Season 3', [], 2026, null);
  assert.ok(confianza({ titulo: 'Ranma ½ (2024) 3rd Season' }, ranma) >= UMBRAL_AUTO);
});
