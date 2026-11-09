import assert from 'node:assert/strict';
import { test } from 'node:test';
import { episodioPrincipal, minutosDe, textoPrincipal, textoQuedan, type ProgresoEp } from './episodiosFicha.ts';

const eps = [1, 2, 3, 4];
const medio = (numero: number, posicionS = 100, duracionS = 1400): ProgresoEp => ({ numero, posicionS, duracionS });

test('sin episodios no hay botón principal', () => {
  assert.equal(episodioPrincipal([], new Set(), []), null);
});

test('una serie sin empezar ofrece el primer episodio', () => {
  assert.deepEqual(episodioPrincipal(eps, new Set(), []), { tipo: 'ver', numero: 1 });
});

test('con episodios vistos ofrece el primero que falta', () => {
  assert.deepEqual(episodioPrincipal(eps, new Set([1, 2]), []), { tipo: 'ver', numero: 3 });
  // Un hueco cuenta: el 1 está visto, el 2 no.
  assert.deepEqual(episodioPrincipal(eps, new Set([1, 3]), []), { tipo: 'ver', numero: 2 });
});

test('un episodio a medias gana; si hay varios, el más reciente (el primero de la lista)', () => {
  assert.deepEqual(episodioPrincipal(eps, new Set([1]), [medio(3), medio(2)]), { tipo: 'continuar', numero: 3 });
});

test('un progreso de un episodio que ya no está en la lista se ignora', () => {
  assert.deepEqual(episodioPrincipal(eps, new Set([1]), [medio(99)]), { tipo: 'ver', numero: 2 });
});

test('con todo visto vuelve al primero', () => {
  assert.deepEqual(episodioPrincipal(eps, new Set(eps), []), { tipo: 'repetir', numero: 1 });
});

test('los textos del botón', () => {
  assert.equal(textoPrincipal({ tipo: 'continuar', numero: 7 }), 'Continuar Ep. 7');
  assert.equal(textoPrincipal({ tipo: 'ver', numero: 3 }), 'Ver Ep. 3');
  assert.equal(textoPrincipal({ tipo: 'repetir', numero: 1 }), 'Volver a ver desde el Ep. 1');
});

test('textoQuedan resta lo visto y no inventa nada sin duración', () => {
  assert.equal(textoQuedan(300, 1400), 'quedan 18:20');
  assert.equal(textoQuedan(1400, 1400), 'quedan 0:00');
  assert.equal(textoQuedan(2000, 1400), 'quedan 0:00');
  assert.equal(textoQuedan(-5, 60), 'quedan 1:00');
  for (const d of [0, -1, Number.NaN]) assert.equal(textoQuedan(10, d), null);
});

test('minutosDe usa la duración real si ya empezaste el episodio y, si no, la típica de la serie', () => {
  assert.equal(minutosDe({ numero: 1, posicionS: 60, duracionS: 1450 }, 24), 24, '1450 s son unos 24 min');
  assert.equal(minutosDe({ numero: 1, posicionS: 60, duracionS: 1800 }, 24), 30, 'manda la real');
  assert.equal(minutosDe(undefined, 24), 24);
  assert.equal(minutosDe({ numero: 1, posicionS: 0, duracionS: 0 }, 24), 24, 'sin duración real vale la típica');
  assert.equal(minutosDe(undefined, null), null);
  assert.equal(minutosDe(undefined, 0), null);
});
