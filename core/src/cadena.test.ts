import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverPrimero } from './cadena.ts';
import { Desafio, FuenteCambio, SinRed, SinServidor } from './errors.ts';
import type { Embed, Playable, ResolverServidor } from './types.ts';

const playable = (url: string): Playable => ({ url, headers: {}, userAgent: 'UA' });
const e1: Embed = { server: 'A', url: 'https://a.test/1' };
const e2: Embed = { server: 'B', url: 'https://b.test/2' };

test('el primer resolutor de la cadena tiene prioridad sobre el orden de los embeds', async () => {
  const soloB: ResolverServidor = (e) => (e.server === 'B' ? playable('b') : null);
  const soloA: ResolverServidor = (e) => (e.server === 'A' ? playable('a') : null);
  const r = await resolverPrimero([e1, e2], [soloB, soloA], 'UA');
  assert.equal(r.playable.url, 'b');
  assert.equal(r.embed, e2);
});

test('pasa al siguiente resolutor si el anterior devuelve null', async () => {
  const nada: ResolverServidor = () => null;
  const ok: ResolverServidor = async () => playable('ok');
  assert.equal((await resolverPrimero([e1], [nada, ok], 'UA')).playable.url, 'ok');
});

test('pasa al siguiente si un resolutor lanza FuenteCambio o SinRed', async () => {
  const roto: ResolverServidor = () => {
    throw new FuenteCambio('la receta cambió');
  };
  const caido: ResolverServidor = async () => {
    throw new SinRed('timeout');
  };
  const ok: ResolverServidor = () => playable('ok');
  assert.equal((await resolverPrimero([e1], [roto, caido, ok], 'UA')).playable.url, 'ok');
});

test('SinServidor lleva las causas de los resolutores que fallaron', async () => {
  const causa = new FuenteCambio('la receta cambió');
  const roto: ResolverServidor = () => {
    throw causa;
  };
  await assert.rejects(resolverPrimero([e1], [roto], 'UA'), (e: unknown) => {
    assert.ok(e instanceof SinServidor);
    assert.deepEqual(e.causas, [causa]);
    return true;
  });
});

test('sin embeds o sin resolutores válidos lanza SinServidor', async () => {
  await assert.rejects(resolverPrimero([], [() => playable('x')], 'UA'), SinServidor);
  await assert.rejects(resolverPrimero([e1], [() => null], 'UA'), SinServidor);
});

test('un Desafio de un resolutor (un espejo) se acumula como causa y la cadena sigue', async () => {
  const causa = new Desafio('cloudflare en el espejo');
  const reto: ResolverServidor = () => {
    throw causa;
  };
  const ok: ResolverServidor = () => playable('ok');
  assert.equal((await resolverPrimero([e1], [reto, ok], 'UA')).playable.url, 'ok');
  await assert.rejects(resolverPrimero([e1], [reto], 'UA'), (e: unknown) => {
    assert.ok(e instanceof SinServidor);
    assert.deepEqual(e.causas, [causa]);
    return true;
  });
});

test('un error ajeno al dominio (un TypeError) sube tal cual y no se disfraza de SinServidor', async () => {
  const bug: ResolverServidor = () => {
    throw new TypeError('bug del resolutor');
  };
  await assert.rejects(resolverPrimero([e1], [bug, () => playable('x')], 'UA'), TypeError);
});

test('el Playable devuelto dice qué servidor ganó', async () => {
  const soloB: ResolverServidor = (e) => (e.server === 'B' ? playable('b') : null);
  const r = await resolverPrimero([e1, e2], [soloB], 'UA');
  assert.equal(r.playable.servidor, 'B');
  assert.equal(r.playable.url, 'b');
});

test('con un servidor preferido, sus embeds se prueban antes que el resto', async () => {
  const todo: ResolverServidor = (e) => playable(e.server);
  const r = await resolverPrimero([e1, e2], [todo], 'UA', 'B');
  assert.equal(r.playable.url, 'B');
  assert.equal(r.embed, e2);
});

test('si el servidor preferido falla, la cadena sigue con el resto en su orden de siempre', async () => {
  const noB: ResolverServidor = (e) => {
    if (e.server === 'B') throw new SinRed('caído');
    return playable(e.server);
  };
  const r = await resolverPrimero([e1, e2], [noB], 'UA', 'B');
  assert.equal(r.playable.url, 'A');
});

test('un servidor preferido que no está entre los embeds no cambia nada', async () => {
  const todo: ResolverServidor = (e) => playable(e.server);
  assert.equal((await resolverPrimero([e1, e2], [todo], 'UA', 'Z')).playable.url, 'A');
  assert.equal((await resolverPrimero([e1, e2], [todo], 'UA', undefined)).playable.url, 'A');
});

test('el preferido no se prueba dos veces', async () => {
  let llamadas = 0;
  const roto: ResolverServidor = (e) => {
    if (e.server === 'B') {
      llamadas++;
      throw new SinRed('caído');
    }
    return null;
  };
  await assert.rejects(resolverPrimero([e1, e2], [roto], 'UA', 'B'), SinServidor);
  assert.equal(llamadas, 1);
});
