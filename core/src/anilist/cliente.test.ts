import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FuenteCambio, NoAutorizado, SinRed } from '../errors.ts';
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

test('con token envía Authorization Bearer; sin token no envía la cabecera', async () => {
  const cabeceras: Array<Record<string, string>> = [];
  const falso = (async (_u: string, init?: RequestInit) => {
    cabeceras.push(init?.headers as Record<string, string>);
    return json({ data: {} });
  }) as typeof fetch;
  await crearClienteAnilist({ limitador: limitadorLibre, fetch: falso, token: async () => 'abc.def' }).consultar('q');
  await crearClienteAnilist({ limitador: limitadorLibre, fetch: falso, token: () => null }).consultar('q');
  await crearClienteAnilist({ limitador: limitadorLibre, fetch: falso }).consultar('q');
  assert.equal(cabeceras[0]?.authorization, 'Bearer abc.def');
  assert.equal(cabeceras[1]?.authorization, undefined);
  assert.equal(cabeceras[2]?.authorization, undefined);
});

test('un 401 lanza NoAutorizado sin incluir el token', async () => {
  const c = crearClienteAnilist({
    limitador: limitadorLibre,
    token: () => 'secreto.token',
    fetch: (async () => new Response('', { status: 401 })) as typeof fetch,
  });
  await assert.rejects(c.consultar('q'), (e: Error) => e instanceof NoAutorizado && !e.message.includes('secreto'));
});

test('«Invalid token» en un 400 o en errors también es NoAutorizado', async () => {
  const cuerpo = { errors: [{ message: 'Invalid token', status: 400 }], data: null };
  for (const status of [400, 200]) {
    const c = crearClienteAnilist({
      limitador: limitadorLibre,
      fetch: (async () => json(cuerpo, { status })) as typeof fetch,
    });
    await assert.rejects(c.consultar('q'), NoAutorizado, `status ${status}`);
  }
});

test('otros errores GraphQL siguen siendo FuenteCambio', async () => {
  const c = crearClienteAnilist({
    limitador: limitadorLibre,
    fetch: (async () => json({ errors: [{ message: 'Otra cosa' }], data: null })) as typeof fetch,
  });
  await assert.rejects(c.consultar('q'), FuenteCambio);
});
