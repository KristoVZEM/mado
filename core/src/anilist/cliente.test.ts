import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FuenteCambio, SinRed } from '../errors.ts';
import { crearClienteAnilist } from './cliente.ts';

const limitadorLibre = { esperar: async () => {} };
const json = (v: unknown, init?: ResponseInit) => new Response(JSON.stringify(v), init);

test('envía la consulta por POST como JSON y devuelve data', async () => {
  const vistas: { url: string; init?: RequestInit }[] = [];
  const c = crearClienteAnilist({
    limitador: limitadorLibre,
    fetch: (async (url: string, init?: RequestInit) => {
      vistas.push({ url, init });
      return json({ data: { x: 1 } });
    }) as typeof fetch,
  });
  assert.deepEqual(await c.consultar('query { x }', { a: 1 }), { x: 1 });
  assert.equal(vistas[0]?.url, 'https://graphql.anilist.co');
  assert.equal(vistas[0]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(vistas[0]?.init?.body)), { query: 'query { x }', variables: { a: 1 } });
});

test('pide turno al limitador antes de cada petición', async () => {
  let turnos = 0;
  const c = crearClienteAnilist({
    limitador: { esperar: async () => void turnos++ },
    fetch: (async () => json({ data: {} })) as typeof fetch,
  });
  await c.consultar('q');
  await c.consultar('q');
  assert.equal(turnos, 2);
});

test('con 429 espera Retry-After y reintenta', async () => {
  const esperas: number[] = [];
  let n = 0;
  const c = crearClienteAnilist({
    limitador: limitadorLibre,
    sleep: async (ms) => void esperas.push(ms),
    fetch: (async () =>
      n++ === 0 ? new Response('', { status: 429, headers: { 'retry-after': '7' } }) : json({ data: { ok: true } })) as typeof fetch,
  });
  assert.deepEqual(await c.consultar('q'), { ok: true });
  assert.deepEqual(esperas, [7000]);
});

test('con 429 repetido acaba en SinRed', async () => {
  const c = crearClienteAnilist({
    limitador: limitadorLibre,
    sleep: async () => {},
    reintentos429: 1,
    fetch: (async () => new Response('', { status: 429 })) as typeof fetch,
  });
  await assert.rejects(c.consultar('q'), SinRed);
});

test('un fallo de red o un 5xx es SinRed', async () => {
  const caido = crearClienteAnilist({
    limitador: limitadorLibre,
    fetch: (async () => {
      throw new TypeError('fallo');
    }) as typeof fetch,
  });
  await assert.rejects(caido.consultar('q'), SinRed);
  const error500 = crearClienteAnilist({ limitador: limitadorLibre, fetch: (async () => new Response('', { status: 502 })) as typeof fetch });
  await assert.rejects(error500.consultar('q'), SinRed);
});

test('un 4xx, un JSON roto o errors en la respuesta son FuenteCambio', async () => {
  const respuestas = [
    () => new Response('', { status: 400 }),
    () => new Response('<html>', { status: 200 }),
    () => json({ errors: [{ message: 'Validation' }], data: null }),
    () => json({}),
  ];
  for (const r of respuestas) {
    const c = crearClienteAnilist({ limitador: limitadorLibre, fetch: (async () => r()) as typeof fetch });
    await assert.rejects(c.consultar('q'), FuenteCambio);
  }
});
