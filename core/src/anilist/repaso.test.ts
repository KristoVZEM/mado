import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planearRepaso, type VinculoAutoRepaso } from './repaso.ts';
import type { MediaAnilist } from './tipos.ts';

const media = (id: number, romaji: string, o: Partial<MediaAnilist> = {}): MediaAnilist => ({
  anilistId: id, malId: null, tituloRomaji: romaji, tituloIngles: null, tituloNativo: null, sinopsis: null,
  generos: [], formato: 'TV', estudio: null, puntuacion: null, episodios: 12, estado: null, portada: null,
  banner: null, siguienteEp: null, siguienteEn: null, relaciones: [], sinonimos: [], anio: 2020, duracion: null, ...o,
});
const v = (aid: number, titulo: string, m: MediaAnilist, confianza = 0.95): VinculoAutoRepaso => ({ aid, titulo, confianza, media: m });

test('un vínculo con la temporada equivocada se rebaja a su parecido actual', () => {
  const r = planearRepaso([v(1, 'Kusuriya no Hitorigoto', media(10, 'Kusuriya no Hitorigoto 2nd Season'))]);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.aid, 1);
  assert.equal(r[0]!.antes, 0.95);
  assert.ok(r[0]!.despues < 0.72, `despues=${r[0]!.despues}`);
});

test('un vínculo correcto no se toca', () => {
  assert.deepEqual(planearRepaso([v(1, 'Dungeon Meshi', media(10, 'Dungeon Meshi'))]), []);
  assert.deepEqual(planearRepaso([v(2, 'Kusuriya no Hitorigoto 2nd Season', media(11, 'Kusuriya no Hitorigoto 2nd Season'))]), []);
});

test('lo que ya era dudoso (confianza < 0,85) se deja como está', () => {
  assert.deepEqual(planearRepaso([v(1, 'Kusuriya no Hitorigoto', media(10, 'Kusuriya no Hitorigoto 2nd Season'), 0.7)]), []);
});

test('un vínculo aceptado gracias al bonus de año y episodios no se rebaja si el título coincide', () => {
  // El título coincide exactamente: el parecido es 1 con o sin bonus.
  assert.deepEqual(planearRepaso([v(1, 'Frieren', media(10, 'Frieren'), 0.86)]), []);
});

test('usa los sinónimos y el título en inglés de la obra', () => {
  const m = media(10, 'Sousou no Frieren', { tituloIngles: "Frieren: Beyond Journey's End", sinonimos: ['Frieren en el funeral'] });
  assert.deepEqual(planearRepaso([v(1, 'Frieren en el funeral', m)]), []);
});
