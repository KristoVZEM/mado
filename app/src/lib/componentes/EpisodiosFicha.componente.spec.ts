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
    difuminar: true,
    alReproducir: vi.fn(),
    alDesmarcar: vi.fn(),
    alMarcarHasta: vi.fn(),
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

  describe('paginación', () => {
    const serie = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
    const sinVer = (n: number, extra: Record<string, unknown> = {}) =>
      props({ total: n, mostrados: serie(n), vistos: new Set(), progresoPorNumero: new Map(), principalNumero: 1, ...extra });
    const visibles = () => screen.getAllByText(/^Episodio \d+$/).map((e) => Number(e.textContent!.replace('Episodio ', '')));

    it('con 24 episodios o menos no hay paginador y se ven todos', () => {
      render(EpisodiosFicha, sinVer(24));
      expect(screen.queryByRole('group', { name: 'Páginas de episodios' })).toBeNull();
      expect(visibles()).toHaveLength(24);
    });

    it('con 600 episodios solo pinta la página de 24', () => {
      render(EpisodiosFicha, sinVer(600));
      expect(visibles()).toEqual(serie(24));
      expect((screen.getByRole('combobox', { name: 'Página' }) as HTMLSelectElement).options).toHaveLength(25);
    });

    it('arranca en la página del episodio principal', () => {
      render(EpisodiosFicha, sinVer(100, { principalNumero: 60 }));
      expect(visibles()[0]).toBe(49);
      expect(visibles().at(-1)).toBe(72);
    });

    it('las flechas cambian de página y se deshabilitan en los extremos', async () => {
      render(EpisodiosFicha, sinVer(50));
      const anterior = screen.getByRole('button', { name: 'Página anterior' }) as HTMLButtonElement;
      const siguiente = screen.getByRole('button', { name: 'Página siguiente' }) as HTMLButtonElement;
      expect(anterior.disabled).toBe(true);
      await fireEvent.click(siguiente);
      expect(visibles()[0]).toBe(25);
      await fireEvent.click(siguiente);
      expect(visibles()).toEqual([49, 50]);
      expect(siguiente.disabled).toBe(true);
      await fireEvent.click(anterior);
      expect(visibles()[0]).toBe(25);
    });

    it('el desplegable salta a cualquier rango y las etiquetas siguen el orden mostrado', async () => {
      render(EpisodiosFicha, sinVer(50, { mostrados: serie(50).reverse(), principalNumero: 50 }));
      const sel = screen.getByRole('combobox', { name: 'Página' }) as HTMLSelectElement;
      expect([...sel.options].map((o) => o.textContent)).toEqual(['50–27', '26–3', '2–1']);
      await fireEvent.change(sel, { target: { value: '2' } });
      expect(visibles()).toEqual([2, 1]);
    });

    it('«Ir al episodio» cambia a su página y lo resalta', async () => {
      render(EpisodiosFicha, sinVer(100));
      await fireEvent.input(screen.getByLabelText('Ir al episodio'), { target: { value: '90' } });
      await fireEvent.submit(screen.getByRole('search', { name: 'Ir a un episodio' }));
      expect(visibles()).toContain(90);
      expect(screen.getByText('Episodio 90').closest('li')!.classList.contains('resaltado')).toBe(true);
    });

    it('«Ir al episodio» con un número que no existe avisa y no mueve la página', async () => {
      render(EpisodiosFicha, sinVer(100));
      await fireEvent.input(screen.getByLabelText('Ir al episodio'), { target: { value: '500' } });
      await fireEvent.submit(screen.getByRole('search', { name: 'Ir a un episodio' }));
      expect(screen.getByRole('status').textContent).toContain('500');
      expect(visibles()[0]).toBe(1);
    });
  });

  describe('miniaturas difuminadas', () => {
    const difuminada = (n: number) => screen.getByText(`Episodio ${n}`).closest('li')!.querySelector('.miniatura')!.hasAttribute('data-difuminada');

    it('difumina los episodios sin ver, y no los vistos, los empezados ni el siguiente', () => {
      // 1 visto, 2 a medias, 3 es el siguiente (principal) y el 4 está sin ver.
      render(EpisodiosFicha, props({ mostrados: [1, 2, 3, 4], total: 4, principalNumero: 3 }));
      expect(difuminada(1)).toBe(false);
      expect(difuminada(2)).toBe(false);
      expect(difuminada(3)).toBe(false);
      expect(difuminada(4)).toBe(true);
    });

    it('con el ajuste apagado no difumina nada', () => {
      render(EpisodiosFicha, props({ mostrados: [1, 2, 3, 4], total: 4, principalNumero: 3, difuminar: false }));
      expect(difuminada(4)).toBe(false);
    });
  });

  describe('marcar vistos hasta aquí', () => {
    it('el primer clic pide confirmar y el segundo avisa con ese número', async () => {
      const p = props({ mostrados: [1, 2, 3], total: 3 });
      render(EpisodiosFicha, p);
      const boton = screen.getByLabelText('Marcar como vistos los episodios hasta el 3');
      await fireEvent.click(boton);
      expect(p.alMarcarHasta).not.toHaveBeenCalled();
      expect(boton.textContent).toContain('¿Seguro?');
      await fireEvent.click(boton);
      expect(p.alMarcarHasta).toHaveBeenCalledWith(3);
    });

    it('al marcar hasta el último de la página, la lista no salta a la del nuevo episodio principal', async () => {
      const mostrados = Array.from({ length: 100 }, (_, i) => i + 1);
      const p = props({ mostrados, total: 100, vistos: new Set(), progresoPorNumero: new Map(), principalNumero: 1 });
      const { rerender } = render(EpisodiosFicha, p);
      const boton = screen.getByLabelText('Marcar como vistos los episodios hasta el 24');
      await fireEvent.click(boton);
      await fireEvent.click(boton);
      // Marcar hasta el 24 hace que el siguiente pase a ser el 25, que está en la página de después.
      await rerender({ ...p, principalNumero: 25, vistos: new Set(mostrados.slice(0, 24)) });
      expect(screen.getByText('Episodio 24')).toBeTruthy();
      expect(screen.queryByText('Episodio 25')).toBeNull();
    });
  });
});
