import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearClienteAniskip, MAX_CUERPO_BYTES, URL_ANISKIP } from './cliente.ts';

interface Llamada { url: string; init: RequestInit }

/** `fetch` falso: guarda lo que se pidió y contesta con lo que diga `responder`. */
function falso(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    llamadas.push({ url, init });
    return responder(url, init);
  }) as unknown as typeof fetch;
  return { f, llamadas };
}

const json = (cuerpo: unknown, init?: ResponseInit) => new Response(JSON.stringify(cuerpo), init);
const bueno = { statusCode: 200, message: 'ok', found: true, results: [
  { skipType: 'op', skipId: 'x', interval: { startTime: 1, endTime: 91 }, episodeLength: 1377 },
] };
const pedido = { malId: 1535, episodio: 1, duracion: 1377.375 };

test('pide solo el opening, con la duración y sin cookies ni más cabeceras que el user-agent', async () => {
  const { f, llamadas } = falso(() => json(bueno));
  const r = await crearClienteAniskip({ fetch: f, version: '0.14.0' }).introDe(pedido);
  assert.deepEqual(r, { estado: 'si', inicio: 1, fin: 91 });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, `${URL_ANISKIP}/1535/1?types=op&episodeLength=1377.4`);
  assert.deepEqual(llamadas[0].init.headers, { 'user-agent': 'Mado/0.14.0' });
  assert.equal(llamadas[0].init.credentials, 'omit');
  assert.ok(llamadas[0].init.signal, 'lleva tope de espera');
  assert.equal(llamadas[0].init.method ?? 'GET', 'GET');
});

test('un 404 o found:false es «no» (se puede guardar)', async () => {
  for (const r of [json({ found: false, results: [] }, { status: 404 }), json({ found: false, results: [] })]) {
    const { f } = falso(() => r);
    assert.deepEqual(await crearClienteAniskip({ fetch: f, version: '1' }).introDe(pedido), { estado: 'no' });
  }
});

test('una respuesta válida pero sin ningún opening plausible es «no»', async () => {
  const absurda = { found: true, results: [{ skipType: 'op', interval: { startTime: 0, endTime: 5000 }, episodeLength: 1377 }] };
  const { f } = falso(() => json(absurda));
  assert.deepEqual(await crearClienteAniskip({ fetch: f, version: '1' }).introDe(pedido), { estado: 'no' });
});

test('400, 5xx, JSON roto y fallos de red son «error» (no se guarda)', async () => {
  const casos: Array<() => Response | Promise<Response>> = [
    () => json({ message: 'Validation failed' }, { status: 400 }),
    () => new Response('caído', { status: 503 }),
    () => new Response('{no es json', { status: 200 }),
    () => { throw new TypeError('fetch failed'); },
  ];
  for (const c of casos) {
    const { f } = falso(c);
    assert.deepEqual(await crearClienteAniskip({ fetch: f, version: '1' }).introDe(pedido), { estado: 'error' });
  }
});

test('un cuerpo de más de 16 KB es «error», lo declare la cabecera o no', async () => {
  assert.equal(MAX_CUERPO_BYTES, 16384);
  const grande = 'x'.repeat(MAX_CUERPO_BYTES + 1);
  const conCabecera = () => new Response(grande, { headers: { 'content-length': String(grande.length) } });
  const sinCabecera = () => new Response(grande);
  for (const c of [conCabecera, sinCabecera]) {
    const { f } = falso(c);
    assert.deepEqual(await crearClienteAniskip({ fetch: f, version: '1' }).introDe(pedido), { estado: 'error' });
  }
});

test('se rinde a los 5 s (aquí 30 ms) sin colgar', async () => {
  const { f } = falso((_url, init) => new Promise((_ok, no) => {
    init.signal!.addEventListener('abort', () => no(init.signal!.reason));
  }));
  const r = await crearClienteAniskip({ fetch: f, version: '1', esperaMs: 30 }).introDe(pedido);
  assert.deepEqual(r, { estado: 'error' });
});

test('con parámetros que AniSkip no acepta ni siquiera pide: es «error»', async () => {
  const { f, llamadas } = falso(() => json(bueno));
  const c = crearClienteAniskip({ fetch: f, version: '1' });
  for (const p of [
    { malId: 0, episodio: 1, duracion: 1400 },
    { malId: 1.5, episodio: 1, duracion: 1400 },
    { malId: 1535, episodio: 12.5, duracion: 1400 },
    { malId: 1535, episodio: -1, duracion: 1400 },
    { malId: 1535, episodio: 1, duracion: 0 },
    { malId: 1535, episodio: 1, duracion: Number.NaN },
  ]) assert.deepEqual(await c.introDe(p), { estado: 'error' });
  assert.equal(llamadas.length, 0);
});
