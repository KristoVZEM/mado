import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esDudoso, hayNuevo, necesitaRefresco, textoProximo, ultimoEmitido } from './anilist.ts';

const DIA_MS = 24 * 60 * 60 * 1000;

test('ultimoEmitido: en emisión es el siguiente menos uno; terminada, el total', () => {
  assert.equal(ultimoEmitido({ siguienteEp: 8, episodios: 12, estado: 'RELEASING' }), 7);
  assert.equal(ultimoEmitido({ siguienteEp: null, episodios: 24, estado: 'FINISHED' }), 24);
  assert.equal(ultimoEmitido({ siguienteEp: 1, episodios: null, estado: 'RELEASING' }), 0);
  assert.equal(ultimoEmitido({ siguienteEp: null, episodios: null, estado: 'NOT_YET_RELEASED' }), null);
  assert.equal(ultimoEmitido({ siguienteEp: null, episodios: 12, estado: 'RELEASING' }), null);
});

test('hayNuevo exige un emitido mayor que lo visto', () => {
  assert.equal(hayNuevo(7, 5), true);
  assert.equal(hayNuevo(7, 7), false);
  assert.equal(hayNuevo(7, null), true);
  assert.equal(hayNuevo(0, null), false);
  assert.equal(hayNuevo(null, 3), false);
});

test('textoProximo: hoy, mañana o el día de la semana, con la hora local', () => {
  const ahora = new Date(2026, 10, 9, 12, 0).getTime() / 1000; // lunes 9 nov 2026
  const en = (d: number, h: number, m: number) => new Date(2026, 10, 9 + d, h, m).getTime() / 1000;
  assert.equal(textoProximo(5, en(0, 18, 30), ahora), 'Ep. 5 hoy a las 18:30');
  assert.equal(textoProximo(5, en(1, 9, 5), ahora), 'Ep. 5 mañana a las 9:05');
  assert.match(textoProximo(5, en(3, 20, 0), ahora)!, /^Ep\. 5 el .+ a las 20:00$/);
  assert.equal(textoProximo(null, 123, ahora), null);
  assert.equal(textoProximo(5, null, ahora), null);
});

test('esDudoso: automático con confianza por debajo del umbral', () => {
  assert.equal(esDudoso({ origen: 'auto', confianza: 0.7 }), true);
  assert.equal(esDudoso({ origen: 'auto', confianza: 0.9 }), false);
  assert.equal(esDudoso({ origen: 'manual', confianza: 0.2 }), false);
  assert.equal(esDudoso({ origen: 'ninguno', confianza: 0.2 }), false);
});

test('necesitaRefresco: más de 24 h, o en emisión con la hora ya pasada', () => {
  const ahora = 100 * DIA_MS;
  assert.equal(necesitaRefresco({ actualizado: ahora - 25 * 60 * 60 * 1000, siguienteEn: null }, ahora), true);
  assert.equal(necesitaRefresco({ actualizado: ahora - 60 * 60 * 1000, siguienteEn: null }, ahora), false);
  assert.equal(necesitaRefresco({ actualizado: ahora - 60 * 60 * 1000, siguienteEn: ahora / 1000 - 10 }, ahora), true);
  assert.equal(necesitaRefresco({ actualizado: ahora - 60 * 60 * 1000, siguienteEn: ahora / 1000 + 3600 }, ahora), false);
  assert.equal(necesitaRefresco({ siguienteEn: null }, ahora), true);
});

test('necesitaRefresco: una obra sin duración se vuelve a pedir pasada 1 h, no 24', () => {
  const ahora = 10 * 24 * 60 * 60 * 1000;
  const hace = (h: number) => ahora - h * 60 * 60 * 1000;
  assert.equal(necesitaRefresco({ actualizado: hace(2), siguienteEn: null, duracion: null }, ahora), true);
  assert.equal(necesitaRefresco({ actualizado: hace(0.5), siguienteEn: null, duracion: null }, ahora), false);
  assert.equal(necesitaRefresco({ actualizado: hace(2), siguienteEn: null, duracion: 24 }, ahora), false);
});
