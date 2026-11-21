import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACENTOS,
  PARTES_INICIO,
  TAMANOS_POSTER,
  TEMAS,
  acentoDe,
  conParte,
  contraste,
  difuminarMiniaturasDe,
  inicioOcultasDe,
  parteOculta,
  tamanoPostersDe,
  temaAplicado,
  temaDe,
  valorDeTema,
} from './apariencia.ts';

test('el tema se lee con tolerancia: ausente o inválido es «oscuro»', () => {
  assert.equal(temaDe(null), 'oscuro');
  assert.equal(temaDe(''), 'oscuro');
  assert.equal(temaDe('abc'), 'oscuro');
  assert.equal(temaDe('9'), 'oscuro');
  assert.equal(temaDe('0'), 'sistema');
  assert.equal(temaDe('1'), 'claro');
  assert.equal(temaDe(' 2 '), 'oscuro');
});

test('valorDeTema y temaDe son inversas', () => {
  for (const t of TEMAS) assert.equal(temaDe(valorDeTema(t.id)), t.id);
});

test('«sistema» sigue a Windows; claro y oscuro mandan', () => {
  assert.equal(temaAplicado('sistema', true), 'claro');
  assert.equal(temaAplicado('sistema', false), 'oscuro');
  assert.equal(temaAplicado('claro', false), 'claro');
  assert.equal(temaAplicado('oscuro', true), 'oscuro');
});

test('el acento fuera de rango vuelve al primero', () => {
  assert.equal(acentoDe(undefined), 0);
  assert.equal(acentoDe('6'), 0);
  assert.equal(acentoDe('-1'), 0);
  assert.equal(acentoDe('3'), 3);
  assert.equal(ACENTOS.length, 6);
});

test('el tamaño de pósters por defecto es el normal (188 px)', () => {
  assert.equal(TAMANOS_POSTER[tamanoPostersDe(null)].ancho, 188);
  assert.equal(TAMANOS_POSTER[tamanoPostersDe('0')].nombre, 'Pequeño');
  assert.equal(tamanoPostersDe('7'), 1);
});

test('contraste: blanco sobre negro es 21 y un color sobre sí mismo es 1', () => {
  assert.ok(Math.abs(contraste('#ffffff', '#000000') - 21) < 0.01);
  assert.ok(Math.abs(contraste('#ff4d6d', '#ff4d6d') - 1) < 0.001);
});

test('el texto oscuro sobre cada acento cumple 4,5:1', () => {
  for (const a of ACENTOS) {
    for (const color of [a.color, a.hover]) {
      assert.ok(contraste('#0a0a0a', color) >= 4.5, `${a.nombre} ${color}: ${contraste('#0a0a0a', color).toFixed(2)}`);
    }
  }
});

test('ocultar partes de Inicio: máscara de bits', () => {
  assert.equal(inicioOcultasDe(null), 0);
  assert.equal(inicioOcultasDe('32'), 0);
  let m = 0;
  m = conParte(m, 'continuar', true);
  assert.equal(m, 2);
  assert.ok(parteOculta(m, 'continuar'));
  assert.ok(!parteOculta(m, 'destacados'));
  m = conParte(m, 'pendientes', true);
  assert.equal(m, 18);
  m = conParte(m, 'continuar', false);
  assert.equal(m, 16);
  m = conParte(m, 'continuar', false);
  assert.equal(m, 16, 'mostrar lo ya visible no cambia nada');
});

test('la máscara máxima cubre todas las partes', () => {
  assert.equal(PARTES_INICIO.length, 5);
  assert.equal((1 << PARTES_INICIO.length) - 1, 31);
});

test('difuminar miniaturas: ausente o inválido es sí; solo «0» lo desactiva', () => {
  assert.equal(difuminarMiniaturasDe(null), true);
  assert.equal(difuminarMiniaturasDe(''), true);
  assert.equal(difuminarMiniaturasDe('x'), true);
  assert.equal(difuminarMiniaturasDe('2'), true);
  assert.equal(difuminarMiniaturasDe('1'), true);
  assert.equal(difuminarMiniaturasDe('0'), false);
});
