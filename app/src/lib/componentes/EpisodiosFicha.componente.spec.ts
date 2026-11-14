import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import EpisodiosFicha from './EpisodiosFicha.svelte';

function props(extra: Record<string, unknown> = {}) {
  const numeros = [1, 2, 3];
  return {
    aid: 1,
    titulo: 'Serie de prueba',
    total: numeros.length,
    mostrados: numeros,
    vistos: new Set<number>([1]),
    progresoPorNumero: new Map([[2, { numero: 2, posicionS: 300, duracionS: 1400 }]]),
    principalNumero: 2,
    duracionMedia: 24,
    idioma: 'SUB' as const,
    conCuenta: false,
    aviso: '',
    alReproducir: vi.fn(),
    alDesmarcar: vi.fn(),
    ...extra,
  };
}

describe('EpisodiosFicha', () => {
  it('lista cada episodio, marca el visto y ofrece quitarlo', () => {
    render(EpisodiosFicha, props());
    expect(screen.getByText('Episodio 1')).toBeTruthy();
    expect(screen.getByText('Episodio 3')).toBeTruthy();
    expect(screen.getByLabelText('Marcar el episodio 1 como no visto')).toBeTruthy();
    expect(screen.queryByLabelText('Marcar el episodio 2 como no visto')).toBeNull();
  });

  it('pulsar un episodio avisa con su número, y la × lo desmarca', async () => {
    const p = props();
    render(EpisodiosFicha, p);
    await fireEvent.click(screen.getByText('Episodio 3'));
    expect(p.alReproducir).toHaveBeenCalledWith(3);
    await fireEvent.click(screen.getByLabelText('Marcar el episodio 1 como no visto'));
    expect(p.alDesmarcar).toHaveBeenCalledWith(1);
  });

  it('el botón del idioma actual está deshabilitado y el otro no', () => {
    render(EpisodiosFicha, props({ idioma: 'DUB' }));
    expect((screen.getByRole('button', { name: 'DUB' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'SUB' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('con la lista vacía no revienta y enseña el total', () => {
    render(EpisodiosFicha, props({ total: 0, mostrados: [], vistos: new Set(), progresoPorNumero: new Map() }));
    expect(screen.getByRole('heading', { name: /Episodios/ }).textContent).toContain('0');
    expect(screen.queryByText(/Episodio \d/)).toBeNull();
  });

  it('con 600 episodios los pinta todos', () => {
    const mostrados = Array.from({ length: 600 }, (_, i) => i + 1);
    render(EpisodiosFicha, props({ total: 600, mostrados, vistos: new Set(), progresoPorNumero: new Map() }));
    expect(screen.getAllByText(/^Episodio \d+$/)).toHaveLength(600);
  });

  it('con números repetidos de la fuente no choca (clave con la posición)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(EpisodiosFicha, props({ total: 3, mostrados: [1, 2, 2], vistos: new Set(), progresoPorNumero: new Map() }));
    expect(screen.getAllByText('Episodio 2')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('muestra el aviso de error si lo hay', () => {
    render(EpisodiosFicha, props({ aviso: 'No se pudo desmarcar' }));
    expect(screen.getByRole('alert').textContent).toBe('No se pudo desmarcar');
  });
});
