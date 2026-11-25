import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MediaAnilist, ResultadoBusqueda } from '../../../core/src/index.ts';
import {
  crearPopulares,
  leerGuardado,
  recordadasVigentes,
  rehacerPopulares,
  RECUERDO_ENCONTRADA_MS,
  RECUERDO_NINGUNA_MS,
  VIGENCIA_MS,
  type DepsPopulares,
  type GuardadoPopulares,
} from './popularesServicio.ts';

const AHORA = 1_800_000_000_000;

/** Una promesa que se resuelve desde fuera (como `Promise.withResolvers`, que el `lib` de TypeScript aún no trae). */
function abierta() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function media(id: number, titulo: string, extra: Partial<MediaAnilist> = {}): MediaAnilist {
  return {
    anilistId: id,
    malId: null,
    tituloRomaji: titulo,
    tituloIngles: null,
    tituloNativo: null,
    sinopsis: null,
    generos: [],
    formato: 'TV',
    estudio: null,
    puntuacion: null,
    episodios: 12,
    estado: 'RELEASING',
    portada: `https://img/${id}.jpg`,
    banner: `https://banner/${id}.jpg`,
    siguienteEp: null,
    siguienteEn: null,
    relaciones: [],
    sinonimos: [],
    anio: 2026,
    duracion: 24,
    ...extra,
  };
}

/** Una fuente falsa: cada título que conoce devuelve su serie; el resto, nada. Anota cada búsqueda. */
function deps(medias: MediaAnilist[], catalogo: Record<string, ResultadoBusqueda>, over: Partial<DepsPopulares> = {}) {
  const busquedas: string[] = [];
  const guardados: string[] = [];
  let guardado: string | null = null;
  const d: DepsPopulares = {
    leer: async () => guardado,
    guardar: async (datos) => {
      guardados.push(datos);
      guardado = datos;
    },
    populares: async () => medias,
    buscar: async (t) => {
      busquedas.push(t);
      return catalogo[t] ? [catalogo[t]] : [];
    },
    ...over,
  };
  return { d, busquedas, guardados, fijar: (g: GuardadoPopulares | null) => (guardado = g && JSON.stringify(g)) };
}

const serie = (aid: number, title: string): ResultadoBusqueda => ({ aid, title, slug: title.toLowerCase().replace(/\s+/g, '-') });

/** Diez obras populares; la fuente tiene todas salvo la 3. */
const MEDIAS = Array.from({ length: 10 }, (_, i) => media(i + 1, `Serie ${i + 1}`));
const CATALOGO = Object.fromEntries(MEDIAS.filter((m) => m.anilistId !== 3).map((m) => [m.tituloRomaji, serie(100 + m.anilistId, m.tituloRomaji)]));

const aids = (items: { destacado: { aid: number } }[]) => items.map((it) => it.destacado.aid);
const esperar = () => new Promise((r) => setTimeout(r, 0));

test('rehacer busca en orden de popularidad, salta las que la fuente no tiene y para al tener 6', async () => {
  const { d, busquedas } = deps(MEDIAS, CATALOGO);
  const items = await rehacerPopulares(d, null, AHORA);
  assert.deepEqual(aids(items), [101, 102, 104, 105, 106, 107]);
  // La 8, 9 y 10 no se buscan: ya hay 6.
  assert.deepEqual(busquedas, ['Serie 1', 'Serie 2', 'Serie 3', 'Serie 4', 'Serie 5', 'Serie 6', 'Serie 7']);
  assert.equal(items[0].destacado.banner, 'https://banner/1.jpg');
  assert.equal(items[0].media?.anilistId, 1);
});

test('rehacer guarda la lista y lo encontrado, también lo que la fuente no tiene', async () => {
  const { d, guardados } = deps(MEDIAS, CATALOGO);
  await rehacerPopulares(d, null, AHORA);
  const g = JSON.parse(guardados[0]) as GuardadoPopulares;
  assert.equal(g.en, AHORA);
  assert.equal(g.items.length, 6);
  assert.deepEqual(g.recordadas!['1'], { aid: 101, slug: 'serie-1', titulo: 'Serie 1', en: AHORA });
  assert.deepEqual(g.recordadas!['3'], { aid: null, en: AHORA });
});

test('con lo recordado, rehacer no vuelve a buscar ni las encontradas ni las que la fuente no tiene', async () => {
  const primero = deps(MEDIAS, CATALOGO);
  await rehacerPopulares(primero.d, null, AHORA);
  const previo = leerGuardado(primero.guardados[0]);
  const segundo = deps(MEDIAS, CATALOGO);
  const items = await rehacerPopulares(segundo.d, previo, AHORA + VIGENCIA_MS);
  assert.deepEqual(aids(items), [101, 102, 104, 105, 106, 107]);
  assert.deepEqual(segundo.busquedas, []);
});

test('una popular nueva es lo único que se busca', async () => {
  const primero = deps(MEDIAS, CATALOGO);
  await rehacerPopulares(primero.d, null, AHORA);
  const nueva = media(50, 'Serie nueva');
  const segundo = deps([nueva, ...MEDIAS], { ...CATALOGO, 'Serie nueva': serie(150, 'Serie nueva') });
  const items = await rehacerPopulares(segundo.d, leerGuardado(primero.guardados[0]), AHORA + VIGENCIA_MS);
  assert.deepEqual(segundo.busquedas, ['Serie nueva']);
  assert.equal(items[0].destacado.aid, 150);
});

test('lo que la fuente no tenía se vuelve a buscar a los 3 días; lo encontrado, a los 30', () => {
  const recordadas = {
    '1': { aid: 101, slug: 's', titulo: 'S', en: AHORA },
    '2': { aid: null, en: AHORA },
  };
  assert.deepEqual(Object.keys(recordadasVigentes(recordadas, AHORA + RECUERDO_NINGUNA_MS - 1)), ['1', '2']);
  assert.deepEqual(Object.keys(recordadasVigentes(recordadas, AHORA + RECUERDO_NINGUNA_MS)), ['1']);
  assert.deepEqual(Object.keys(recordadasVigentes(recordadas, AHORA + RECUERDO_ENCONTRADA_MS)), []);
});

test('lo recordado con otra forma se ignora', () => {
  const rotas = {
    a: null,
    b: 'texto',
    c: { aid: 5, en: AHORA }, // le faltan slug y título
    d: { aid: 'x', slug: 's', titulo: 'S', en: AHORA },
    e: { aid: null },
  } as Record<string, unknown>;
  assert.deepEqual(recordadasVigentes(rotas, AHORA), {});
});

test('un fallo de red al buscar no se recuerda como «no la tiene»', async () => {
  const { d, guardados } = deps(MEDIAS, CATALOGO, {
    buscar: async (t) => {
      if (t === 'Serie 2') throw new Error('SinRed');
      return CATALOGO[t] ? [CATALOGO[t]] : [];
    },
  });
  const error = console.error;
  console.error = () => {};
  const items = await rehacerPopulares(d, null, AHORA).finally(() => (console.error = error));
  assert.ok(!aids(items).includes(102));
  const g = JSON.parse(guardados[0]) as GuardadoPopulares;
  assert.equal(g.recordadas!['2'], undefined);
});

test('las obras sin banner ni portada se saltan sin buscarlas', async () => {
  const sinImagen = media(1, 'Serie 1', { banner: null, portada: null });
  const { d, busquedas } = deps([sinImagen, ...MEDIAS.slice(1)], CATALOGO);
  const items = await rehacerPopulares(d, null, AHORA);
  assert.ok(!busquedas.includes('Serie 1'));
  assert.ok(!aids(items).includes(101));
});

test('sin ninguna serie no guarda nada', async () => {
  const { d, guardados } = deps(MEDIAS, {});
  assert.deepEqual(await rehacerPopulares(d, null, AHORA), []);
  assert.equal(guardados.length, 0);
});

test('leerGuardado acepta el formato de antes (sin recordadas) y descarta lo roto', () => {
  assert.deepEqual(leerGuardado(JSON.stringify({ en: 5, items: [] })), { en: 5, items: [], recordadas: {} });
  assert.equal(leerGuardado('{no es json'), null);
  assert.equal(leerGuardado(JSON.stringify({ items: [] })), null);
  assert.equal(leerGuardado(JSON.stringify({ en: 5, items: 'x' })), null);
  assert.equal(leerGuardado(null), null);
});

test('la primera vez, sin nada guardado, espera a rehacer la lista', async () => {
  const { d } = deps(MEDIAS, CATALOGO);
  const populares = crearPopulares(d);
  assert.deepEqual(aids(await populares({ ahoraMs: AHORA })), [101, 102, 104, 105, 106, 107]);
});

test('con la lista vigente la devuelve sin pedir nada', async () => {
  let pedidas = 0;
  const { d, fijar, busquedas } = deps(MEDIAS, CATALOGO, { populares: async () => (pedidas++, MEDIAS) });
  const previo = await rehacerPopulares(d, null, AHORA);
  pedidas = 0;
  busquedas.length = 0;
  fijar({ en: AHORA, items: previo });
  const alRenovar = () => assert.fail('no debía renovar');
  const items = await crearPopulares(d)({ ahoraMs: AHORA + VIGENCIA_MS - 1, alRenovar });
  assert.deepEqual(aids(items), aids(previo));
  await esperar();
  assert.equal(pedidas, 0);
  assert.equal(busquedas.length, 0);
});

test('con la lista vencida devuelve la vieja al instante y la nueva llega por alRenovar', async () => {
  const nueva = media(50, 'Serie nueva');
  const { d, fijar } = deps([nueva, ...MEDIAS], { ...CATALOGO, 'Serie nueva': serie(150, 'Serie nueva') });
  const vieja = await rehacerPopulares(deps(MEDIAS, CATALOGO).d, null, AHORA);
  fijar({ en: AHORA, items: vieja });
  let renovada: number[] | null = null;
  const { promise, resolve } = abierta();
  const items = await crearPopulares(d)({
    ahoraMs: AHORA + VIGENCIA_MS,
    alRenovar: (n) => {
      renovada = aids(n);
      resolve();
    },
  });
  assert.deepEqual(aids(items), aids(vieja));
  await promise;
  assert.deepEqual(renovada, [150, 101, 102, 104, 105, 106]);
});

test('con la lista vencida y AniList caído se queda con la vieja y no renueva', async () => {
  const { d, fijar } = deps(MEDIAS, CATALOGO, {
    populares: async () => {
      throw new Error('AniList caído');
    },
  });
  const vieja = await rehacerPopulares(deps(MEDIAS, CATALOGO).d, null, AHORA);
  fijar({ en: AHORA, items: vieja });
  const error = console.error;
  console.error = () => {};
  try {
    const items = await crearPopulares(d)({ ahoraMs: AHORA + VIGENCIA_MS, alRenovar: () => assert.fail('no debía renovar') });
    assert.deepEqual(aids(items), aids(vieja));
    await esperar();
  } finally {
    console.error = error;
  }
});

test('sin nada guardado y AniList caído, lanza', async () => {
  const { d } = deps(MEDIAS, CATALOGO, {
    populares: async () => {
      throw new Error('AniList caído');
    },
  });
  await assert.rejects(crearPopulares(d)({ ahoraMs: AHORA }), /AniList caído/);
});

test('si se pide otra vez mientras se rehace, no se rehace dos veces', async () => {
  let pedidas = 0;
  const { promise: suelta, resolve: soltar } = abierta();
  const { d } = deps(MEDIAS, CATALOGO, {
    populares: async () => {
      pedidas++;
      await suelta;
      return MEDIAS;
    },
  });
  const populares = crearPopulares(d);
  const a = populares({ ahoraMs: AHORA });
  const b = populares({ ahoraMs: AHORA });
  await esperar();
  soltar();
  assert.deepEqual(aids(await a), aids(await b));
  assert.equal(pedidas, 1);
});
