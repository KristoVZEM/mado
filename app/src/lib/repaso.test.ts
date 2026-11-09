import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MediaAnilist } from '../../../core/src/index.ts';
import type { VinculoAuto } from './datos.ts';
import { repasarSiHaceFalta, VERSION_REPASO, type DepsRepaso } from './repaso.ts';

const media = (id: number, romaji: string): MediaAnilist => ({
  anilistId: id, malId: null, tituloRomaji: romaji, tituloIngles: null, tituloNativo: null, sinopsis: null,
  generos: [], formato: 'TV', estudio: null, puntuacion: null, episodios: 12, estado: null, portada: null,
  banner: null, siguienteEp: null, siguienteEn: null, relaciones: [], sinonimos: [], anio: 2020,
});
const va = (aid: number, titulo: string, obra: string, confianza = 0.95): VinculoAuto => ({
  aid, slug: `s${aid}`, titulo, confianza, media: media(aid * 10, obra),
});

function entorno(vinculos: VinculoAuto[], version = 0, falla: number[] = []) {
  const log: string[] = [];
  const guardado = { version };
  const deps: DepsRepaso = {
    vinculos: async () => vinculos,
    rebajar: async (serie, anilistId, confianza) => {
      if (falla.includes(serie.aid)) throw new Error('disco');
      log.push(`rebajar:${serie.aid}:${anilistId}:${confianza.toFixed(2)}`);
    },
    version: async () => guardado.version,
    guardarVersion: async (n) => void (guardado.version = n),
  };
  return { deps, log, guardado };
}

test('rebaja los vínculos de otra temporada y anota la versión', async () => {
  const { deps, log, guardado } = entorno([
    va(1, 'Kusuriya no Hitorigoto', 'Kusuriya no Hitorigoto 2nd Season'),
    va(2, 'Dungeon Meshi', 'Dungeon Meshi'),
  ]);
  const r = await repasarSiHaceFalta(deps);
  assert.equal(r?.length, 1);
  assert.equal(log.length, 1);
  assert.match(log[0]!, /^rebajar:1:10:0\.[0-6]\d$/);
  assert.equal(guardado.version, VERSION_REPASO);
});

test('si ya se repasó con estas reglas no hace nada', async () => {
  const { deps, log } = entorno([va(1, 'Kusuriya no Hitorigoto', 'Kusuriya no Hitorigoto 2nd Season')], VERSION_REPASO);
  assert.equal(await repasarSiHaceFalta(deps), null);
  assert.deepEqual(log, []);
});

test('si una rebaja falla no anota la versión (se reintenta al abrir) y las demás se aplican', async () => {
  const { deps, log, guardado } = entorno(
    [va(1, 'A', 'A 2nd Season'), va(2, 'B', 'B 2nd Season')],
    0,
    [1],
  );
  const r = await repasarSiHaceFalta(deps);
  assert.equal(r?.length, 2);
  assert.equal(log.length, 1);
  assert.equal(guardado.version, 0);
});

test('sin vínculos auto anota la versión igualmente', async () => {
  const { deps, guardado } = entorno([]);
  assert.deepEqual(await repasarSiHaceFalta(deps), []);
  assert.equal(guardado.version, VERSION_REPASO);
});
