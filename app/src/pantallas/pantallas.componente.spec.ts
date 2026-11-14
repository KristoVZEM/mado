import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import { render } from '@testing-library/svelte';
import { reiniciarTauri } from '../pruebas/tauriFalso.ts';
import { backendConDatos, backendVacio, SERIE_FALSA } from '../pruebas/datos.ts';
import { fuentes } from '../lib/fuentes.ts';
import { asentar, reiniciarNavegacion, vigilarConsola } from '../pruebas/vigilar.ts';

const PANTALLAS = {
  Inicio: () => import('./Inicio.svelte'),
  Biblioteca: () => import('./Biblioteca.svelte'),
  Catalogo: () => import('./Catalogo.svelte'),
  Emision: () => import('./Emision.svelte'),
  Historial: () => import('./Historial.svelte'),
  Ajustes: () => import('./Ajustes.svelte'),
  Ficha: () => import('./Ficha.svelte'),
} as const;

const SERIE = { aid: 1, title: 'Serie de prueba', slug: 'serie-de-prueba' };

describe.each(Object.entries(PANTALLAS))('%s con backend vacío', (nombre, cargar) => {
  let consola: ReturnType<typeof vigilarConsola>;
  beforeEach(() => {
    reiniciarTauri();
    reiniciarNavegacion();
    backendVacio();
    consola = vigilarConsola();
  });
  afterEach(() => consola.parar());

  it('se monta, no escribe errores en consola y no queda vacía', async () => {
    const { default: Pantalla } = await cargar();
    const { container } = render(Pantalla as Component<Record<string, unknown>>, nombre === 'Ficha' ? { anime: SERIE } : {});
    await asentar();
    expect(consola.mensajes()).toEqual([]);
    expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});

// Qué texto de los datos de ejemplo debe verse en cada pantalla (prueba de que no se pinta vacía con datos).
const SE_VE: Record<string, string> = {
  Inicio: SERIE_FALSA.title,
  Biblioteca: SERIE_FALSA.title,
  Catalogo: SERIE_FALSA.title,
  Emision: 'Serie de prueba (romaji)',
  Historial: SERIE_FALSA.title,
  Ficha: SERIE_FALSA.title,
};

describe.each(Object.entries(PANTALLAS))('%s con datos de ejemplo', (nombre, cargar) => {
  let consola: ReturnType<typeof vigilarConsola>;
  beforeEach(() => {
    reiniciarTauri();
    reiniciarNavegacion();
    backendConDatos();
    vi.mocked(fuentes.catalogo).mockResolvedValue([SERIE_FALSA]);
    vi.mocked(fuentes.buscar).mockResolvedValue([SERIE_FALSA]);
    vi.mocked(fuentes.episodios).mockResolvedValue({
      title: 'Serie de prueba',
      episodes: [1, 2, 3, 4, 5].map((n) => ({ id: n, number: n })),
      synopsis: 'Sinopsis de prueba.',
      genres: ['Acción'],
      status: 'En emisión',
      anio: 2026,
    });
    consola = vigilarConsola();
  });
  afterEach(() => consola.parar());

  it('se monta con datos, sin errores en consola y enseña lo que tiene', async () => {
    const { default: Pantalla } = await cargar();
    const { container } = render(Pantalla as Component<Record<string, unknown>>, nombre === 'Ficha' ? { anime: SERIE_FALSA } : {});
    await asentar();
    expect(consola.mensajes()).toEqual([]);
    const esperado = SE_VE[nombre];
    if (esperado) expect(container.textContent).toContain(esperado);
    else expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
