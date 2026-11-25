import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Destacados from './Destacados.svelte';
import type { ItemDestacado } from '../destacado.ts';

vi.mock('../tmdbServicio.ts', () => ({ imagenesTmdb: vi.fn(async () => null) }));
// Con «reducir movimiento» las transiciones duran 0 y el carrusel no pasa solo: happy-dom no sabe cancelar animaciones.
vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }));

const item = (aid: number, titulo: string): ItemDestacado => ({
  destacado: { aid, anilistId: aid + 1000, slug: `s-${aid}`, titulo, banner: `https://banner/${aid}.jpg`, numero: null },
  media: null,
});

const props = (items: ItemDestacado[]) => ({ items, alContinuar: vi.fn(), alAbrirFicha: vi.fn() });
const enPantalla = () => screen.getByRole('heading', { level: 2 }).textContent?.trim();

describe('Destacados al cambiar la lista', () => {
  // Los botones de biblioteca consultan la base, que aquí no está falseada: el error que registran no importa.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  it('si la serie que se ve sigue en la lista nueva, se queda en ella aunque cambie de sitio', async () => {
    const { rerender } = render(Destacados, props([item(1, 'Uno'), item(2, 'Dos'), item(3, 'Tres')]));
    await fireEvent.click(screen.getByRole('button', { name: 'Serie siguiente' }));
    expect(enPantalla()).toBe('Dos');
    await rerender(props([item(9, 'Nueva'), item(3, 'Tres'), item(2, 'Dos')]));
    expect(enPantalla()).toBe('Dos');
  });

  it('si la serie que se ve ya no está, se queda en la misma posición', async () => {
    const { rerender } = render(Destacados, props([item(1, 'Uno'), item(2, 'Dos'), item(3, 'Tres')]));
    await fireEvent.click(screen.getByRole('button', { name: 'Serie siguiente' }));
    await rerender(props([item(7, 'Siete'), item(8, 'Ocho'), item(9, 'Nueve')]));
    expect(enPantalla()).toBe('Ocho');
  });

  it('si la lista nueva es más corta, no se queda en blanco', async () => {
    const { rerender } = render(Destacados, props([item(1, 'Uno'), item(2, 'Dos'), item(3, 'Tres')]));
    await fireEvent.click(screen.getByRole('button', { name: 'Serie anterior' }));
    expect(enPantalla()).toBe('Tres');
    await rerender(props([item(7, 'Siete'), item(8, 'Ocho')]));
    expect(enPantalla()).toBe('Ocho');
  });
});
