import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClienteAnilist } from './cliente.ts';
import { agendaSemana, aCandidato, buscarCandidatos, consultaBuscar, parseMedia, popularesEnEmision } from './consultas.ts';

const crudo = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  idMal: id + 1,
  title: { romaji: `Obra ${id}`, english: `Work ${id}`, native: null },
  synonyms: [`Alias ${id}`, '', 5],
  seasonYear: 2023,
  episodes: 12,
  duration: 24,
  status: 'RELEASING',
  format: 'TV',
  description: 'Sinopsis<br>en inglés',
  genres: ['Action', 'Drama'],
  averageScore: 84,
  coverImage: { large: 'https://s4.anilist.co/c.jpg' },
  bannerImage: 'https://s4.anilist.co/b.jpg',
  nextAiringEpisode: { episode: 5, airingAt: 1_800_000_000 },
  studios: { nodes: [{ name: 'Madhouse' }] },
  relations: {
    edges: [
      { relationType: 'SEQUEL', node: { id: 99, type: 'ANIME', title: { romaji: 'Secuela' } } },
      { relationType: 'ADAPTATION', node: { id: 7, type: 'MANGA', title: { romaji: 'Manga' } } },
    ],
  },
  ...extra,
});

test('parseMedia normaliza los campos y descarta lo que no sirve', () => {
  const m = parseMedia(crudo(10));
  assert.deepEqual(m, {
    anilistId: 10,
    malId: 11,
    tituloRomaji: 'Obra 10',
    tituloIngles: 'Work 10',
    tituloNativo: null,
    sinopsis: 'Sinopsis<br>en inglés',
    generos: ['Action', 'Drama'],
    formato: 'TV',
    estudio: 'Madhouse',
    puntuacion: 84,
    episodios: 12,
    estado: 'RELEASING',
    portada: 'https://s4.anilist.co/c.jpg',
    banner: 'https://s4.anilist.co/b.jpg',
    siguienteEp: 5,
    siguienteEn: 1_800_000_000,
    relaciones: [{ anilistId: 99, tipo: 'SEQUEL', titulo: 'Secuela', portada: null }],
    sinonimos: ['Alias 10'],
    anio: 2023,
    duracion: 24,
  });
});

test('parseMedia: tolera campos que faltan, usa startDate.year y rechaza lo inválido o adulto', () => {
  const minimo = parseMedia({ id: 3, title: { english: 'Solo inglés' }, startDate: { year: 2001 } });
  assert.equal(minimo?.tituloRomaji, 'Solo inglés');
  assert.equal(minimo?.anio, 2001);
  assert.equal(minimo?.siguienteEp, null);
  assert.deepEqual(minimo?.relaciones, []);
  assert.equal(parseMedia(null), null);
  assert.equal(parseMedia({ id: 0, title: { romaji: 'X' } }), null);
  assert.equal(parseMedia({ id: 1, title: {} }), null);
  assert.equal(parseMedia(crudo(5, { isAdult: true })), null);
  assert.equal(parseMedia(crudo(5, { bannerImage: 'http://inseguro/b.jpg' }))?.banner, null);
});

test('consultaBuscar genera un alias y una variable por título', () => {
  const q = consultaBuscar(2);
  assert.match(q, /\$t0: String, \$t1: String/);
  assert.match(q, /b0: Page\(perPage: 5\)/);
  assert.match(q, /b1: Page\(perPage: 5\)/);
  assert.match(q, /fragment CamposMedia on Media/);
});

test('buscarCandidatos agrupa de 3 en 3 y devuelve los candidatos alineados con los títulos', async () => {
  const llamadas: Record<string, unknown>[] = [];
  const cliente: ClienteAnilist = {
    consultar: (async (_q: string, v: Record<string, unknown>) => {
      llamadas.push(v);
      const data: Record<string, unknown> = {};
      Object.keys(v).forEach((k, i) => (data[`b${i}`] = { media: [crudo(100 + Number(k.slice(1)) + llamadas.length * 10)] }));
      return data;
    }) as ClienteAnilist['consultar'],
  };
  const r = await buscarCandidatos(cliente, ['a', 'b', 'c', 'd']);
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas[0], { t0: 'a', t1: 'b', t2: 'c' });
  assert.deepEqual(llamadas[1], { t0: 'd' });
  assert.equal(r.length, 4);
  assert.ok(r.every((x) => x.length === 1));
});

test('buscarCandidatos devuelve lista vacía para un título sin resultados', async () => {
  const cliente: ClienteAnilist = { consultar: (async () => ({ b0: { media: [] } })) as ClienteAnilist['consultar'] };
  assert.deepEqual(await buscarCandidatos(cliente, ['x']), [[]]);
});

test('agendaSemana recorre páginas hasta el final, junta obras sin repetir y descarta lo inválido', async () => {
  const paginas = [
    {
      Page: {
        pageInfo: { hasNextPage: true },
        airingSchedules: [
          { episode: 5, airingAt: 1000, media: crudo(1) },
          { episode: 3, airingAt: 1100, media: crudo(2) },
        ],
      },
    },
    {
      Page: {
        pageInfo: { hasNextPage: false },
        airingSchedules: [
          { episode: 6, airingAt: 2000, media: crudo(1) },
          { episode: 0, airingAt: 2100, media: crudo(2) },
          { episode: 1, airingAt: 2200, media: { id: -1 } },
        ],
      },
    },
  ];
  const vistas: unknown[] = [];
  const cliente: ClienteAnilist = {
    consultar: (async (_q: string, v: Record<string, unknown>) => {
      vistas.push(v);
      return paginas[(v.pagina as number) - 1];
    }) as ClienteAnilist['consultar'],
  };
  const r = await agendaSemana(cliente, 500, 3000);
  assert.deepEqual(vistas, [
    { desde: 500, hasta: 3000, pagina: 1 },
    { desde: 500, hasta: 3000, pagina: 2 },
  ]);
  assert.deepEqual(r.medias.map((m) => m.anilistId), [1, 2]);
  assert.deepEqual(r.items, [
    { anilistId: 1, episodio: 5, emiteEn: 1000 },
    { anilistId: 2, episodio: 3, emiteEn: 1100 },
    { anilistId: 1, episodio: 6, emiteEn: 2000 },
  ]);
});

test('agendaSemana respeta el máximo de páginas', async () => {
  let n = 0;
  const cliente: ClienteAnilist = {
    consultar: (async () => {
      n++;
      return { Page: { pageInfo: { hasNextPage: true }, airingSchedules: [] } };
    }) as ClienteAnilist['consultar'],
  };
  await agendaSemana(cliente, 0, 10, 3);
  assert.equal(n, 3);
});

test('aCandidato conserva los nombres, el año y los episodios', () => {
  const m = parseMedia(crudo(10))!;
  assert.deepEqual(aCandidato(m), {
    anilistId: 10,
    tituloRomaji: 'Obra 10',
    tituloIngles: 'Work 10',
    tituloNativo: null,
    sinonimos: ['Alias 10'],
    anio: 2023,
    episodios: 12,
  });
});

test('popularesEnEmision pide n obras y descarta las inválidas', async () => {
  let pedido: Record<string, unknown> = {};
  const cliente: ClienteAnilist = {
    consultar: (async (_q: string, v: Record<string, unknown>) => {
      pedido = v;
      return { Page: { media: [crudo(1), { id: 0 }, crudo(2, { isAdult: true }), crudo(3)] } };
    }) as ClienteAnilist['consultar'],
  };
  const r = await popularesEnEmision(cliente, 5);
  assert.deepEqual(pedido, { n: 5 });
  assert.deepEqual(r.map((m) => m.anilistId), [1, 3]);
});
