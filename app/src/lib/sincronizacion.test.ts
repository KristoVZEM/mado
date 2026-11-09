import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NoAutorizado } from '../../../core/src/errors.ts';
import type { Bajada, LocalSync, RemotoSync, Subida } from '../../../core/src/index.ts';
import type { Cuenta } from './datos.ts';
import { crearSincronizador, type DepsSync } from './sincronizacion.ts';

const cuentaConSync: Cuenta = { usuarioId: 42, nombre: 'k', ultimaSync: 1000 };
const local = (o: Partial<LocalSync> = {}): LocalSync => ({
  aid: 1, anilistId: 100, estado: null, actualizado: 0, progreso: 0, episodios: null, ...o,
});
const remoto = (o: Partial<RemotoSync> = {}): RemotoSync => ({ anilistId: 100, estado: 1, actualizado: 5, progreso: 0, ...o });

function entorno(o: {
  cuenta?: Cuenta | null;
  locales?: LocalSync[];
  remotos?: RemotoSync[];
  remotoDe?: RemotoSync | null;
  subir?: (c: Subida[]) => Promise<{ ok: number; fallos: { anilistId: number; motivo: string }[] }>;
  bajar?: (b: Bajada[]) => Promise<number>;
} = {}) {
  const log: string[] = [];
  const temporizadores: Array<{ f: () => void; ms: number; vivo: boolean }> = [];
  const deps: DepsSync = {
    cuenta: async () => (o.cuenta === undefined ? cuentaConSync : o.cuenta),
    locales: async (aid) => (o.locales ?? []).filter((l) => aid === undefined || l.aid === aid),
    remotos: async () => o.remotos ?? [],
    remotoDe: async () => (o.remotoDe === undefined ? null : o.remotoDe),
    subir: async (c) => {
      log.push(`subir:${c.length}`);
      return o.subir ? o.subir(c) : { ok: c.length, fallos: [] };
    },
    bajar: async (b) => {
      log.push(`bajar:${b.length}`);
      return o.bajar ? o.bajar(b) : b.length;
    },
    marcarSincronizada: async () => void log.push('marcada'),
    alDesautorizar: async () => void log.push('desautorizado'),
    ahora: () => 0,
    temporizador: {
      poner: (f, ms) => {
        // Al dispararse, el temporizador deja de estar vivo (como uno real).
        const t = {
          f: () => {
            t.vivo = false;
            f();
          },
          ms,
          vivo: true,
        };
        temporizadores.push(t);
        return t;
      },
      quitar: (t) => void ((t as { vivo: boolean }).vivo = false),
    },
  };
  return { deps, log, temporizadores };
}

test('sin cuenta no sincroniza', async () => {
  const { deps } = entorno({ cuenta: null });
  assert.equal(await crearSincronizador(deps).sincronizar(), 'sin-cuenta');
});

test('la primera vez (sin ultimaSync) exige la vista previa y no toca nada', async () => {
  const { deps, log } = entorno({ cuenta: { usuarioId: 1, nombre: 'k', ultimaSync: null }, locales: [local({ estado: 1 })] });
  assert.equal(await crearSincronizador(deps).sincronizar(), 'primera');
  assert.deepEqual(log, []);
});

test('previsualizar devuelve el plan sin aplicar nada', async () => {
  const { deps, log } = entorno({
    cuenta: { usuarioId: 1, nombre: 'k', ultimaSync: null },
    locales: [local({ estado: 2 })],
    remotos: [],
  });
  const plan = await crearSincronizador(deps).previsualizar();
  assert.deepEqual(plan.subir, [{ anilistId: 100, estado: 2 }]);
  assert.deepEqual(log, []);
});

test('sincronizar baja primero, sube después y marca la hora al final', async () => {
  const { deps, log } = entorno({
    locales: [local({ aid: 1, anilistId: 100 }), local({ aid: 2, anilistId: 200, estado: 1 })],
    remotos: [remoto({ anilistId: 100, estado: 3, progreso: 12 })],
  });
  const r = await crearSincronizador(deps).sincronizar();
  assert.deepEqual(log, ['bajar:1', 'subir:1', 'marcada']);
  assert.deepEqual(r, { subidas: 1, bajadas: 1, conflictos: 0, fallos: 0 });
});

test('si bajar falla, no sube ni marca', async () => {
  const { deps, log } = entorno({
    locales: [local({ estado: 1 })],
    remotos: [remoto({ estado: 3 })],
    bajar: async () => {
      throw new Error('disco');
    },
  });
  await assert.rejects(crearSincronizador(deps).sincronizar(), /disco/);
  assert.ok(!log.includes('subir:1') && !log.includes('marcada'));
});

test('los fallos de series sueltas se cuentan pero la sincronización no se marca completa', async () => {
  const { deps, log } = entorno({
    locales: [local({ estado: 1 })],
    subir: async () => ({ ok: 0, fallos: [{ anilistId: 100, motivo: 'x' }] }),
  });
  const r = await crearSincronizador(deps).sincronizar();
  assert.equal((r as { fallos: number }).fallos, 1);
  assert.ok(!log.includes('marcada'), 'con fallos no se marca como sincronizada del todo');
});

test('NoAutorizado al subir borra el token (alDesautorizar) y se propaga', async () => {
  const { deps, log } = entorno({
    locales: [local({ estado: 1 })],
    subir: async () => {
      throw new NoAutorizado('x');
    },
  });
  await assert.rejects(crearSincronizador(deps).sincronizar(), NoAutorizado);
  assert.ok(log.includes('desautorizado'));
});

test('avisarCambio espera 5 s y funde varios avisos de la misma serie en uno', async () => {
  const { deps, log, temporizadores } = entorno({ locales: [local({ aid: 1, estado: 1, actualizado: 9, progreso: 3 })], remotoDe: null });
  const s = crearSincronizador(deps);
  s.avisarCambio(1);
  s.avisarCambio(1);
  assert.equal(temporizadores.filter((t) => t.vivo).length, 1, 'el segundo aviso reinicia el temporizador');
  assert.equal(temporizadores.at(-1)!.ms, 5000);
  temporizadores.at(-1)!.f();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(log, ['subir:1', 'marcada']);
});

test('avisarCambio no hace nada si aún no hubo primera sincronización o no hay cuenta', async () => {
  for (const cuenta of [null, { usuarioId: 1, nombre: 'k', ultimaSync: null }]) {
    const { deps, log, temporizadores } = entorno({ cuenta, locales: [local({ estado: 1 })] });
    const s = crearSincronizador(deps);
    s.avisarCambio(1);
    for (const t of temporizadores) t.f();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(log, []);
  }
});

test('una sincronización en curso no se solapa: la segunda espera el mismo resultado', async () => {
  let activas = 0;
  let maximo = 0;
  const { deps } = entorno({
    locales: [local({ estado: 1 })],
    subir: async (c) => {
      activas++;
      maximo = Math.max(maximo, activas);
      await new Promise((r) => setTimeout(r, 10));
      activas--;
      return { ok: c.length, fallos: [] };
    },
  });
  const s = crearSincronizador(deps);
  await Promise.all([s.sincronizar(), s.sincronizar()]);
  assert.equal(maximo, 1);
});

// --- Reintentos tras un fallo ---

const turno = () => new Promise((r) => setImmediate(r));
const vivos = <T extends { vivo: boolean }>(ts: T[]) => ts.filter((t) => t.vivo);
const rechazo = { ok: 0, fallos: [{ anilistId: 100, motivo: 'x' }] };

test('si subir falla, reintenta a los 30 s, 2 min, 10 min y 30 min, y luego se rinde', async () => {
  const { deps, log, temporizadores } = entorno({
    locales: [local({ aid: 1, estado: 1, actualizado: 9 })],
    remotoDe: null,
    subir: async () => rechazo,
  });
  crearSincronizador(deps).avisarCambio(1);
  temporizadores.at(-1)!.f(); // el aviso de 5 s
  await turno();
  const esperas: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = vivos(temporizadores).at(-1);
    if (!t || t.ms === 5000) break;
    esperas.push(t.ms);
    t.vivo = false;
    t.f();
    await turno();
  }
  assert.deepEqual(esperas, [30_000, 120_000, 600_000, 1_800_000]);
  assert.equal(vivos(temporizadores).length, 0, 'tras el cuarto reintento no queda nada programado');
  assert.equal(log.filter((l) => l === 'subir:1').length, 5, 'el intento original y cuatro reintentos');
});

test('un reintento que funciona corta la cadena', async () => {
  let n = 0;
  const { deps, log, temporizadores } = entorno({
    locales: [local({ aid: 1, estado: 1, actualizado: 9 })],
    remotoDe: null,
    subir: async (c) => (++n === 1 ? rechazo : { ok: c.length, fallos: [] }),
  });
  crearSincronizador(deps).avisarCambio(1);
  temporizadores.at(-1)!.f();
  await turno();
  const t = vivos(temporizadores).at(-1)!;
  assert.equal(t.ms, 30_000);
  t.vivo = false;
  t.f();
  await turno();
  assert.equal(vivos(temporizadores).length, 0);
  assert.ok(log.includes('marcada'));
});

test('un error de red también se reintenta', async () => {
  let n = 0;
  const { deps, temporizadores } = entorno({
    locales: [local({ aid: 1, estado: 1, actualizado: 9 })],
    remotoDe: null,
    subir: async (c) => {
      if (++n === 1) throw new Error('sin red');
      return { ok: c.length, fallos: [] };
    },
  });
  crearSincronizador(deps).avisarCambio(1);
  temporizadores.at(-1)!.f();
  await turno();
  assert.equal(vivos(temporizadores).at(-1)!.ms, 30_000);
});

test('NoAutorizado no se reintenta', async () => {
  const { deps, log, temporizadores } = entorno({ locales: [local({ aid: 1, estado: 1, actualizado: 9 })] });
  deps.remotoDe = async () => {
    throw new NoAutorizado();
  };
  crearSincronizador(deps).avisarCambio(1);
  temporizadores.at(-1)!.f();
  await turno();
  assert.equal(vivos(temporizadores).length, 0);
  assert.ok(log.includes('desautorizado'));
});

test('un cambio nuevo en la serie cancela su reintento y empieza de cero', async () => {
  const { deps, temporizadores } = entorno({
    locales: [local({ aid: 1, estado: 1, actualizado: 9 })],
    remotoDe: null,
    subir: async () => rechazo,
  });
  const s = crearSincronizador(deps);
  s.avisarCambio(1);
  temporizadores.at(-1)!.f();
  await turno();
  const reintento = vivos(temporizadores).at(-1)!;
  assert.equal(reintento.ms, 30_000);
  s.avisarCambio(1);
  assert.equal(reintento.vivo, false, 'el reintento anterior se canceló');
  assert.equal(vivos(temporizadores).at(-1)!.ms, 5000);
});

test('cada serie lleva su propia cadena de reintentos', async () => {
  const { deps, temporizadores } = entorno({
    locales: [local({ aid: 1, anilistId: 100, estado: 1, actualizado: 9 }), local({ aid: 2, anilistId: 200, estado: 1, actualizado: 9 })],
    remotoDe: null,
    subir: async () => rechazo,
  });
  const s = crearSincronizador(deps);
  s.avisarCambio(1);
  s.avisarCambio(2);
  for (const t of [...temporizadores]) t.f();
  await turno();
  assert.equal(vivos(temporizadores).filter((t) => t.ms === 30_000).length, 2);
});

test('sincronizarConReintentos: avisa de cada resultado y reintenta si hubo fallos', async () => {
  let n = 0;
  const { deps, temporizadores } = entorno({
    locales: [local({ estado: 1, actualizado: 9 })],
    remotos: [],
    subir: async (c) => (++n === 1 ? rechazo : { ok: c.length, fallos: [] }),
  });
  const resultados: unknown[] = [];
  const s = crearSincronizador(deps);
  await s.sincronizarConReintentos((r) => resultados.push(typeof r === 'object' ? r.fallos : r));
  assert.deepEqual(resultados, [1]);
  const t = vivos(temporizadores).at(-1)!;
  assert.equal(t.ms, 30_000);
  t.vivo = false;
  t.f();
  await turno();
  assert.deepEqual(resultados, [1, 0]);
  assert.equal(vivos(temporizadores).length, 0);
});

test('sincronizarConReintentos no reintenta sin cuenta ni lanza si todo falla', async () => {
  const sin = entorno({ cuenta: null });
  await crearSincronizador(sin.deps).sincronizarConReintentos();
  assert.equal(vivos(sin.temporizadores).length, 0);

  const cae = entorno({ locales: [local({ estado: 1 })] });
  cae.deps.remotos = async () => {
    throw new Error('red');
  };
  await crearSincronizador(cae.deps).sincronizarConReintentos();
  assert.equal(vivos(cae.temporizadores).at(-1)!.ms, 30_000);
});
