import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearResolverMP4Upload } from './resolver-mp4upload.ts';
import { FuenteCambio, SinRed } from './errors.ts';

const EMBED = { server: 'MP4Upload', url: 'https://www.mp4upload.com/embed-iwh1k72esxo1.html' };

test('captura el stream del embed y añade el referer de MP4Upload', async () => {
  const pedidos: string[] = [];
  const resolver = crearResolverMP4Upload(async (url) => {
    pedidos.push(url);
    return 'https://a4.mp4upload.com:183/d/token/video.mp4';
  });
  const p = await resolver(EMBED, 'UA-test');
  assert.deepEqual(p, {
    url: 'https://a4.mp4upload.com:183/d/token/video.mp4',
    headers: { referer: 'https://www.mp4upload.com/' },
    userAgent: 'UA-test',
  });
  assert.deepEqual(pedidos, [EMBED.url]);
});

test('ignora los embeds que no son de MP4Upload sin capturar nada', async () => {
  let llamadas = 0;
  const resolver = crearResolverMP4Upload(async () => {
    llamadas++;
    return 'https://x.test/v.mp4';
  });
  for (const url of [
    'https://voe.sx/e/abc',
    'https://www.mp4upload.com.evil.test/embed-abc.html',
    'http://www.mp4upload.com/embed-abc.html',
    'https://www.mp4upload.com/otra-cosa',
  ]) {
    assert.equal(await resolver({ server: 'X', url }, 'UA'), null);
  }
  assert.equal(llamadas, 0);
});

test('un fallo de la captura se reporta como SinRed con la causa original', async () => {
  const original = 'sin captura válida (timeout)';
  const resolver = crearResolverMP4Upload(async () => {
    throw original;
  });
  await assert.rejects(resolver(EMBED, 'UA'), (e: unknown) => {
    assert.ok(e instanceof SinRed);
    assert.equal(e.cause, original);
    return true;
  });
});

test('una captura que no es una URL https lanza FuenteCambio', async () => {
  for (const capturada of ['', 'javascript:alert(1)', 'http://x.test/v.mp4', 'no es url', 42 as unknown as string]) {
    const resolver = crearResolverMP4Upload(async () => capturada);
    await assert.rejects(resolver(EMBED, 'UA'), FuenteCambio);
  }
});
