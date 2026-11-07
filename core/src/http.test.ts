import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoChallenge, createHttp, leerJson, UA } from './http.ts';
import { Desafio, FuenteCambio, SinRed } from './errors.ts';

test('una respuesta 200 pasa', () => {
  assert.doesNotThrow(() => assertNoChallenge(new Response('ok', { status: 200 })));
});

test('un 503 de Cloudflare sin cf-mitigated no es desafío', () => {
  const res = new Response('x', { status: 503, headers: { server: 'cloudflare' } });
  assert.doesNotThrow(() => assertNoChallenge(res));
});

test('un 403 servido por Cloudflare es un desafío', () => {
  const res = new Response('x', { status: 403, headers: { server: 'cloudflare' } });
  assert.throws(() => assertNoChallenge(res), Desafio);
});

test('un 403 con cf-mitigated es un desafío', () => {
  const res = new Response('x', { status: 403, headers: { 'cf-mitigated': 'challenge' } });
  assert.throws(() => assertNoChallenge(res), Desafio);
});

test('un 503 o 403 sin Cloudflare, y un 404, no son desafío', () => {
  assert.doesNotThrow(() => assertNoChallenge(new Response('x', { status: 503 })));
  assert.doesNotThrow(() => assertNoChallenge(new Response('x', { status: 403, headers: { server: 'nginx' } })));
  assert.doesNotThrow(() => assertNoChallenge(new Response('x', { status: 404 })));
});

// Reloj y espera falsos: sleep avanza el reloj y registra la espera.
function relojFalso() {
  let t = 10_000;
  const esperas: number[] = [];
  return {
    esperas,
    now: () => t,
    sleep: async (ms: number) => {
      esperas.push(ms);
      t += ms;
    },
  };
}

test('envía el user-agent y una señal de timeout', async () => {
  const reloj = relojFalso();
  let visto: RequestInit | undefined;
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    fetch: async (_url, init) => {
      visto = init;
      return new Response('ok');
    },
  });
  await http.get('https://x.test/');
  assert.equal((visto?.headers as Record<string, string>)['user-agent'], UA);
  assert.ok(visto?.signal instanceof AbortSignal);
  assert.equal(http.userAgent, UA);
});

test('reintenta tras un error de red y devuelve la respuesta cuando llega', async () => {
  const reloj = relojFalso();
  let llamadas = 0;
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 2,
    backoffMs: 100,
    fetch: async () => {
      llamadas++;
      if (llamadas === 1) throw new TypeError('fetch failed');
      return new Response('ok');
    },
  });
  const res = await http.get('https://x.test/');
  assert.equal(await res.text(), 'ok');
  assert.equal(llamadas, 2);
  assert.deepEqual(reloj.esperas, [100]);
});

test('agota los reintentos y lanza SinRed con la causa original', async () => {
  const reloj = relojFalso();
  let llamadas = 0;
  const original = new TypeError('fetch failed');
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 2,
    backoffMs: 100,
    fetch: async () => {
      llamadas++;
      throw original;
    },
  });
  await assert.rejects(http.get('https://x.test/'), (e: unknown) => {
    assert.ok(e instanceof SinRed);
    assert.equal(e.cause, original);
    return true;
  });
  assert.equal(llamadas, 3);
  assert.deepEqual(reloj.esperas, [100, 200]);
});

test('un 5xx sin Cloudflare se reintenta y acaba en SinRed', async () => {
  const reloj = relojFalso();
  let llamadas = 0;
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 1,
    backoffMs: 10,
    fetch: async () => {
      llamadas++;
      return new Response('x', { status: 502 });
    },
  });
  await assert.rejects(http.get('https://x.test/'), SinRed);
  assert.equal(llamadas, 2);
});

test('un desafío de Cloudflare no se reintenta', async () => {
  const reloj = relojFalso();
  let llamadas = 0;
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 3,
    fetch: async () => {
      llamadas++;
      return new Response('x', { status: 403, headers: { server: 'cloudflare' } });
    },
  });
  await assert.rejects(http.get('https://x.test/'), Desafio);
  assert.equal(llamadas, 1);
});

test('un 503 con server cloudflare se reintenta y acaba en SinRed', async () => {
  const reloj = relojFalso();
  let llamadas = 0;
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 2,
    backoffMs: 10,
    fetch: async () => {
      llamadas++;
      return new Response('x', { status: 503, headers: { server: 'cloudflare' } });
    },
  });
  await assert.rejects(http.get('https://x.test/'), SinRed);
  assert.equal(llamadas, 3);
});

test('el timeout aborta una petición que no responde y lanza SinRed', async () => {
  const reloj = relojFalso();
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 0,
    timeoutMs: 20,
    fetch: (_url, init) =>
      new Promise((_, rechazar) => {
        init!.signal!.addEventListener('abort', () => rechazar(init!.signal!.reason));
      }),
  });
  await assert.rejects(http.get('https://x.test/'), SinRed);
});

test('un 404 se devuelve tal cual, sin reintentos', async () => {
  const reloj = relojFalso();
  let llamadas = 0;
  const http = createHttp({
    ...reloj,
    gapMs: 0,
    retries: 3,
    fetch: async () => {
      llamadas++;
      return new Response('no', { status: 404 });
    },
  });
  const res = await http.get('https://x.test/');
  assert.equal(res.status, 404);
  assert.equal(llamadas, 1);
});

test('el limitador separa las peticiones simultáneas por gapMs', async () => {
  const reloj = relojFalso();
  const http = createHttp({ ...reloj, gapMs: 1500, fetch: async () => new Response('ok') });
  await Promise.all([http.get('https://x.test/1'), http.get('https://x.test/2'), http.get('https://x.test/3')]);
  assert.deepEqual(reloj.esperas, [1500, 1500]);
});

test('leerJson devuelve el JSON de una respuesta 2xx', async () => {
  assert.deepEqual(await leerJson(new Response('{"a":1}'), 'prueba'), { a: 1 });
});

test('leerJson lanza FuenteCambio si no es 2xx o no es JSON', async () => {
  await assert.rejects(leerJson(new Response('x', { status: 404 }), 'prueba'), FuenteCambio);
  await assert.rejects(leerJson(new Response('<html>', { status: 200 }), 'prueba'), FuenteCambio);
});

test('leerJson lanza SinRed si falla la lectura del cuerpo', async () => {
  const cuerpo = new ReadableStream({ start: (c) => c.error(new Error('abortado')) });
  await assert.rejects(leerJson(new Response(cuerpo), 'prueba'), SinRed);
});
