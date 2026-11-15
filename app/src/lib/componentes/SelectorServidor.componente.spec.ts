import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import SelectorServidor from './SelectorServidor.svelte';

function props(extra: Record<string, unknown> = {}) {
  return {
    servidor: 'HLS',
    calidad: 1080,
    clave: '1:SUB',
    pedirServidores: vi.fn().mockResolvedValue(['HLS', 'MP4Upload', 'Otro']),
    alElegir: vi.fn(),
    ...extra,
  };
}

const boton = () => screen.getByRole('button', { name: /Elegir servidor/ });

describe('SelectorServidor', () => {
  it('muestra calidad y servidor actuales en el botón', () => {
    render(SelectorServidor, props());
    expect(boton().textContent).toContain('1080p · HLS');
  });

  it('al abrir muestra «Buscando servidores…» y luego solo los que la app sabe resolver, con el actual marcado', async () => {
    // La lista tarda: la prueba decide cuándo llega, para poder ver el estado intermedio.
    let llega!: (v: string[]) => void;
    render(SelectorServidor, props({ pedirServidores: () => new Promise<string[]>((r) => (llega = r)) }));
    await fireEvent.click(boton());
    expect(screen.getByText('Buscando servidores…')).toBeTruthy();
    llega(['HLS', 'MP4Upload', 'Otro']);
    const hls = await screen.findByRole('menuitemradio', { name: /HLS/ });
    const mp4 = screen.getByRole('menuitemradio', { name: /MP4Upload/ });
    expect(hls.getAttribute('aria-checked')).toBe('true');
    expect(mp4.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('menuitemradio', { name: /Otro/ })).toBeNull();
  });

  it('pide la lista una sola vez mientras la clave no cambie', async () => {
    const p = props();
    render(SelectorServidor, p);
    await fireEvent.click(boton());
    await screen.findByRole('menuitemradio', { name: /HLS/ });
    await fireEvent.click(boton()); // cierra
    await fireEvent.click(boton()); // abre de nuevo
    await screen.findByRole('menuitemradio', { name: /HLS/ });
    expect(p.pedirServidores).toHaveBeenCalledTimes(1);
  });

  it('pide la lista otra vez si cambia la clave (otro episodio o idioma)', async () => {
    const p = props();
    const { rerender } = render(SelectorServidor, p);
    await fireEvent.click(boton());
    await screen.findByRole('menuitemradio', { name: /HLS/ });
    await fireEvent.click(boton());
    await rerender({ clave: '2:SUB' });
    await fireEvent.click(boton());
    await screen.findByRole('menuitemradio', { name: /HLS/ });
    expect(p.pedirServidores).toHaveBeenCalledTimes(2);
  });

  it('elegir otro avisa con el nombre y la lista del episodio, y cierra el menú', async () => {
    const p = props();
    render(SelectorServidor, p);
    await fireEvent.click(boton());
    await fireEvent.click(await screen.findByRole('menuitemradio', { name: /MP4Upload/ }));
    expect(p.alElegir).toHaveBeenCalledWith('MP4Upload', ['HLS', 'MP4Upload', 'Otro']);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('elegir el servidor actual no avisa', async () => {
    const p = props();
    render(SelectorServidor, p);
    await fireEvent.click(boton());
    await fireEvent.click(await screen.findByRole('menuitemradio', { name: /HLS/ }));
    expect(p.alElegir).not.toHaveBeenCalled();
  });

  it('REGRESIÓN #78: tras pasar a MP4Upload el menú sigue ofreciendo HLS y se puede volver', async () => {
    const p = props();
    const { rerender } = render(SelectorServidor, p);
    await fireEvent.click(boton());
    await fireEvent.click(await screen.findByRole('menuitemradio', { name: /MP4Upload/ }));
    await rerender({ servidor: 'MP4Upload', calidad: 1080 }); // el padre cambió el servidor actual
    await fireEvent.click(boton());
    const hls = await screen.findByRole('menuitemradio', { name: /HLS/ });
    expect(hls.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(hls);
    expect(p.alElegir).toHaveBeenLastCalledWith('HLS', ['HLS', 'MP4Upload', 'Otro']);
    expect(boton().hasAttribute('disabled')).toBe(false);
  });

  it('si pedir la lista falla, el menú queda con solo el servidor actual y no revienta', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(SelectorServidor, props({ pedirServidores: vi.fn().mockRejectedValue(new Error('sin red')) }));
    await fireEvent.click(boton());
    const unico = await screen.findAllByRole('menuitemradio');
    expect(unico).toHaveLength(1);
    expect(unico[0].textContent).toContain('HLS');
    error.mockRestore();
  });

  it('con `ocupado` el botón está deshabilitado', () => {
    render(SelectorServidor, props({ ocupado: true }));
    expect(boton().hasAttribute('disabled')).toBe(true);
  });

  it('un clic fuera cierra el menú', async () => {
    render(SelectorServidor, props());
    await fireEvent.click(boton());
    await screen.findByRole('menu');
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('el padre lo cierra poniendo `abierto` a false (el Esc del reproductor)', async () => {
    const { rerender } = render(SelectorServidor, props());
    await fireEvent.click(boton());
    await screen.findByRole('menu');
    await rerender({ abierto: false });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
