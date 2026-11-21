import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { llamadasA, reiniciarTauri, responder } from '../pruebas/tauriFalso.ts';
import { backendVacio } from '../pruebas/datos.ts';
import { asentar, reiniciarNavegacion } from '../pruebas/vigilar.ts';
import { popularesDeInicio } from '../lib/popularesInicio.ts';
import Inicio from './Inicio.svelte';

// Una carga que sale bien trae series populares para la cabecera; sin ellas (sin red) se considera fallida.
vi.mock('../lib/popularesInicio.ts', () => ({
  popularesDeInicio: vi.fn(async () => [
    {
      destacado: { aid: 1, anilistId: 1, slug: 'serie-de-prueba', titulo: 'Serie de prueba', banner: 'https://s4.anilist.co/banner/1.jpg', numero: null },
      media: null,
    },
  ]),
}));

// Inicio vuelve a pedir sus datos al volver a verse la ventana (foco o visibilidad) si son viejos o si fallaron; nunca dos veces
// seguidas. Se falsea solo `Date`: las esperas de `asentar` siguen siendo reales.

const MIN = 60_000;
const cargas = () => llamadasA('continuar_viendo').length;

async function montado() {
  render(Inicio, {});
  await asentar();
}

beforeEach(() => {
  reiniciarTauri();
  reiniciarNavegacion();
  backendVacio();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-22T09:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Inicio al volver a verse la ventana', () => {
  // Va la primera: el precargador recuerda lo que ya pidió mientras vive el módulo, y esta prueba necesita verlo pedir.
  it('al cargar precarga las imágenes de la cabecera, aunque la ventana no se vea', async () => {
    const pedidas: string[] = [];
    vi.stubGlobal(
      'Image',
      class {
        set src(url: string) {
          pedidas.push(url);
        }
      },
    );
    await montado();
    vi.unstubAllGlobals();
    expect(pedidas).toContain('https://s4.anilist.co/banner/1.jpg');
  });

  it('carga una vez al montarse', async () => {
    await montado();
    expect(cargas()).toBe(1);
  });

  it('con datos recientes y sin fallo no vuelve a pedirlos', async () => {
    await montado();
    vi.setSystemTime(Date.now() + 5 * MIN);
    window.dispatchEvent(new Event('focus'));
    await asentar();
    expect(cargas()).toBe(1);
  });

  it('pasados 10 minutos los vuelve a pedir al recibir el foco', async () => {
    await montado();
    vi.setSystemTime(Date.now() + 11 * MIN);
    window.dispatchEvent(new Event('focus'));
    await asentar();
    expect(cargas()).toBe(2);
  });

  it('y también al cambiar la visibilidad a «visible»', async () => {
    await montado();
    vi.setSystemTime(Date.now() + 11 * MIN);
    document.dispatchEvent(new Event('visibilitychange'));
    await asentar();
    expect(cargas()).toBe(2);
  });

  it('el foco y la visibilidad juntos no cargan dos veces', async () => {
    await montado();
    vi.setSystemTime(Date.now() + 11 * MIN);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await asentar();
    expect(cargas()).toBe(2);
  });

  it('si la ventana se esconde no se pide nada', async () => {
    await montado();
    vi.setSystemTime(Date.now() + 11 * MIN);
    const estado = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await asentar();
    estado.mockRestore();
    expect(cargas()).toBe(1);
  });

  it('si la primera carga falló, se reintenta pasados 30 s sin esperar los 10 minutos', async () => {
    responder('estado_datos', () => {
      throw new Error('la base no responde');
    });
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {});
    await montado();
    expect(llamadasA('estado_datos').length).toBe(1);
    // Antes de 30 s, no.
    vi.setSystemTime(Date.now() + 10_000);
    window.dispatchEvent(new Event('focus'));
    await asentar();
    expect(llamadasA('estado_datos').length).toBe(1);
    // Pasados los 30 s, sí, aunque no hayan pasado 10 minutos.
    vi.setSystemTime(Date.now() + 31_000);
    window.dispatchEvent(new Event('focus'));
    await asentar();
    expect(llamadasA('estado_datos').length).toBe(2);
    consola.mockRestore();
  });

  it('si la carga no trajo populares (sin red), se reintenta pasados 30 s', async () => {
    vi.mocked(popularesDeInicio).mockResolvedValueOnce([]);
    await montado();
    expect(cargas()).toBe(1);
    vi.setSystemTime(Date.now() + 31_000);
    window.dispatchEvent(new Event('focus'));
    await asentar();
    expect(cargas()).toBe(2);
  });

  it('al desmontar la pantalla ya no escucha', async () => {
    const { unmount } = render(Inicio, {});
    await asentar();
    unmount();
    vi.setSystemTime(Date.now() + 11 * MIN);
    window.dispatchEvent(new Event('focus'));
    await asentar();
    expect(cargas()).toBe(1);
  });
});
