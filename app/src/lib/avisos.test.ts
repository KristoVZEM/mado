import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CandidataAviso } from './datos.ts';
import { crearVigilante, type DepsAvisos } from './avisos.ts';

const cand = (aid: number, ultimoAvisado: number | null, ultimoVisto = 0): CandidataAviso => ({
  aid, slug: `s${aid}`, titulo: `T${aid}`, ultimoAvisado, ultimoVisto,
});

function entorno(
  candidatas: CandidataAviso[],
  disponibles: Record<string, number[] | Error>,
  extra: Partial<DepsAvisos> = {},
) {
  const log: string[] = [];
  const deps: DepsAvisos = {
    activo: async () => true,
    candidatas: async () => {
      log.push('candidatas');
      return candidatas;
    },
    disponibles: async (slug) => {
      const d = disponibles[slug];
      if (d instanceof Error) throw d;
      return d ?? [];
    },
    guardar: async (items) => void log.push(`guardar:${items.map((i) => `${i.aid}=${i.ultimo}`).join(',')}`),
    notificar: async (t) => void log.push(`notificar:${t.titulo}|${t.cuerpo}`),
    pausa: async (ms) => void log.push(`pausa:${ms}`),
    ...extra,
  };
  return { log, vigilante: crearVigilante(deps) };
}

test('si los avisos están apagados no pide ni una candidata', async () => {
  const { log, vigilante } = entorno([cand(1, 3)], { s1: [1, 2, 3, 4] }, { activo: async () => false });
  assert.equal(await vigilante.comprobar(), 0);
  assert.deepEqual(log, []);
});

test('una serie nueva solo anota lo disponible, sin avisar', async () => {
  const { log, vigilante } = entorno([cand(1, null)], { s1: [1, 2, 3] });
  assert.equal(await vigilante.comprobar(), 0);
  assert.deepEqual(log, ['candidatas', 'guardar:1=3']);
});

test('un episodio nuevo avisa primero y anota después', async () => {
  const { log, vigilante } = entorno([cand(1, 3, 3)], { s1: [1, 2, 3, 4] });
  assert.equal(await vigilante.comprobar(), 1);
  assert.deepEqual(log, ['candidatas', 'notificar:T1|Episodio 4 disponible', 'guardar:1=4']);
});

test('varias series nuevas salen en un solo aviso, con pausa entre peticiones', async () => {
  const { log, vigilante } = entorno([cand(1, 3, 3), cand(2, 1, 1)], { s1: [4], s2: [2] });
  assert.equal(await vigilante.comprobar(), 2);
  assert.deepEqual(log, ['candidatas', 'pausa:1000', 'notificar:2 episodios nuevos|T1 (4), T2 (2)', 'guardar:1=4,2=2']);
});

test('si la fuente falla en una serie, las demás se procesan', async () => {
  const { log, vigilante } = entorno([cand(1, 3, 3), cand(2, 1, 1)], { s1: new Error('red'), s2: [2] });
  assert.equal(await vigilante.comprobar(), 1);
  assert.ok(log.includes('notificar:T2|Episodio 2 disponible'), log.join(' / '));
});

test('si notificar falla no anota nada y no lanza', async () => {
  const { log, vigilante } = entorno([cand(1, 3, 3)], { s1: [4] }, {
    notificar: async () => {
      throw new Error('permiso');
    },
  });
  assert.equal(await vigilante.comprobar(), 0);
  assert.ok(!log.some((l) => l.startsWith('guardar')), log.join(' / '));
});

test('si guardar falla tampoco lanza', async () => {
  const { vigilante } = entorno([cand(1, 3, 3)], { s1: [4] }, {
    guardar: async () => {
      throw new Error('disco');
    },
  });
  assert.equal(await vigilante.comprobar(), 0);
});

test('un ciclo no se solapa con otro', async () => {
  let suelta!: () => void;
  const { log, vigilante } = entorno([cand(1, null)], { s1: [1] }, {
    candidatas: () => new Promise((r) => (suelta = () => r([cand(1, null)]))),
  });
  const primero = vigilante.comprobar();
  assert.equal(await vigilante.comprobar(), 0, 'el segundo ciclo se descarta');
  suelta();
  await primero;
  assert.deepEqual(log, ['guardar:1=1']);
});
