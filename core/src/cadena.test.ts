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

test('un Desafío no se traga: sube tal cual', async () => {
  const reto: ResolverServidor = () => {
    throw new Desafio('cloudflare');
  };
  await assert.rejects(resolverPrimero([e1], [reto, () => playable('x')], 'UA'), Desafio);
});
