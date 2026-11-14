import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOPE_MEMORIA, claveDeVista, crearMemoria, crearRestaurador } from './desplazamiento.ts';

test('claveDeVista: la ficha por su serie, la sección por su nombre y el Reproductor no tiene', () => {
  assert.equal(claveDeVista({ tipo: 'ficha', anime: { aid: 7 } }, 'catalogo'), 'ficha:7');
  assert.equal(claveDeVista(null, 'biblioteca'), 'seccion:biblioteca');
  assert.equal(claveDeVista({ tipo: 'reproducir', anime: { aid: 7 } }, 'inicio'), null);
});

test('la memoria devuelve lo guardado y nada de lo que no conoce', () => {
  const m = crearMemoria();
  m.guardar('ficha:1', 420);
  assert.equal(m.leer('ficha:1'), 420);
  assert.equal(m.leer('ficha:2'), undefined);
});

test('guardar de nuevo la misma clave la actualiza, y 0 (arriba del todo) la borra', () => {
  const m = crearMemoria();
  m.guardar('seccion:catalogo', 100);
  m.guardar('seccion:catalogo', 900);
  assert.equal(m.leer('seccion:catalogo'), 900);
  m.guardar('seccion:catalogo', 0);
  assert.equal(m.leer('seccion:catalogo'), undefined);
});

test('la memoria olvida lo más antiguo al pasar el tope', () => {
  const m = crearMemoria(3);
  for (const n of [1, 2, 3, 4]) m.guardar(`ficha:${n}`, n * 10);
  assert.equal(m.leer('ficha:1'), undefined);
  assert.equal(m.leer('ficha:4'), 40);
  assert.equal(TOPE_MEMORIA, 30);
});

test('guardar una clave existente la rejuvenece: no es la primera en olvidarse', () => {
  const m = crearMemoria(2);
  m.guardar('a', 10);
  m.guardar('b', 20);
  m.guardar('a', 15); // ahora «b» es la más antigua
  m.guardar('c', 30);
  assert.equal(m.leer('a'), 15);
  assert.equal(m.leer('b'), undefined);
});

/** Un entorno falso: la altura crece cuando la prueba lo decide y los fotogramas se disparan a mano. */
function entorno(alturaMaxima: number) {
  const e = {
    alturaMaxima,
    ahora: 0,
    puesto: [] as number[],
    pendientes: [] as Array<() => void>,
    fotograma() {
      const cb = e.pendientes.shift();
      e.ahora += 16;
      cb?.();
    },
  };
  const r = crearRestaurador({
    maximo: () => e.alturaMaxima,
    desplazarA: (y) => void e.puesto.push(y),
    ahora: () => e.ahora,
    siguienteFotograma: (cb) => void e.pendientes.push(cb),
    tope: 1000,
  });
  return { e, r };
}

test('si la página ya mide lo suficiente, salta enseguida a la posición', () => {
  const { e, r } = entorno(5000);
  r.iniciar(1200);
  e.fotograma();
  assert.deepEqual(e.puesto, [1200]);
  assert.equal(e.pendientes.length, 0);
});

test('si el contenido aún no llega, espera fotogramas y salta cuando la página crece', () => {
  const { e, r } = entorno(300);
  r.iniciar(1200);
  e.fotograma();
  e.fotograma();
  assert.deepEqual(e.puesto, []);
  e.alturaMaxima = 2000;
  e.fotograma();
  assert.deepEqual(e.puesto, [1200]);
});

test('si pasa el tope sin que la página crezca, va a lo máximo que haya y deja de intentarlo', () => {
  const { e, r } = entorno(300);
  r.iniciar(1200);
  for (let i = 0; i < 200 && e.pendientes.length > 0; i++) e.fotograma();
  assert.equal(e.pendientes.length, 0);
  assert.deepEqual(e.puesto, [300]);
});

test('cancelar (el usuario se movió) para sin tocar el desplazamiento', () => {
  const { e, r } = entorno(300);
  r.iniciar(1200);
  e.fotograma();
  r.cancelar();
  e.alturaMaxima = 5000;
  e.fotograma();
  e.fotograma();
  assert.deepEqual(e.puesto, []);
});

test('iniciar otra restauración cancela la anterior', () => {
  const { e, r } = entorno(5000);
  r.iniciar(100);
  r.iniciar(700);
  while (e.pendientes.length > 0) e.fotograma();
  assert.deepEqual(e.puesto, [700]);
});
