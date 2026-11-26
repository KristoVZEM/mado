import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import MenuSerie from './MenuSerie.svelte';
import { asentar } from '../../pruebas/vigilar.ts';

function montar(extra: Record<string, unknown> = {}) {
  const props = {
    titulo: 'Dandadan', estado: 1, favorito: false, abierto: true,
    alAbrir: vi.fn(), alCerrar: vi.fn(), alReproducir: vi.fn(), alCambiarEstado: vi.fn(), alAlternarFavorito: vi.fn(), alQuitar: vi.fn(),
    cargarPrincipal: vi.fn(async () => ({ tipo: 'continuar' as const, numero: 6 })),
    ...extra,
  };
  return { ...render(MenuSerie, props), props };
}

describe('MenuSerie', () => {
  it('ofrece continuar con el episodio calculado y marca el estado actual', async () => {
    const { container, props } = montar();
    await asentar();
    const botones = [...container.querySelectorAll('[role="menu"] button')];
    expect(botones[0].textContent).toContain('Continuar Ep. 6');
    const viendo = botones.find((b) => b.textContent?.includes('Viendo'))!;
    expect(viendo.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(botones[0]);
    expect(props.alReproducir).toHaveBeenCalledWith(6);
  });

  it('«Quitar de la biblioteca» pide un segundo clic', async () => {
    const { container, props } = montar();
    await asentar();
    const quitar = () => [...container.querySelectorAll('button')].find((b) => /Quitar de la biblioteca|¿Quitar\?/.test(b.textContent ?? ''))!;
    await fireEvent.click(quitar());
    expect(props.alQuitar).not.toHaveBeenCalled();
    expect(quitar().textContent).toContain('¿Quitar? Pulsa otra vez');
    await fireEvent.click(quitar());
    expect(props.alQuitar).toHaveBeenCalledTimes(1);
  });

  it('sin estado no ofrece quitar; si falla el cálculo, no ofrece continuar', async () => {
    const { container } = montar({ estado: null, cargarPrincipal: vi.fn(async () => { throw new Error('red'); }) });
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    await asentar();
    expect(container.textContent).not.toContain('Quitar de la biblioteca');
    expect(container.textContent).not.toContain('Continuar');
    errores.mockRestore();
  });

  it('mientras calcula el episodio, «Continuar» no actúa pero tiene el foco', async () => {
    let resolver!: (p: { tipo: 'continuar'; numero: number }) => void;
    const { container, props } = montar({ cargarPrincipal: vi.fn(() => new Promise((r) => (resolver = r))) });
    await asentar();
    const continuar = container.querySelector<HTMLElement>('[role="menu"] button')!;
    expect(continuar.textContent).toContain('Continuar');
    expect(continuar.getAttribute('aria-disabled')).toBe('true');
    expect(continuar.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(continuar);
    await fireEvent.click(continuar);
    expect(props.alReproducir).not.toHaveBeenCalled();
    resolver({ tipo: 'continuar', numero: 6 });
    await asentar();
    expect(container.querySelector('[role="menu"] button')!.getAttribute('aria-disabled')).toBe('false');
    expect(document.activeElement).toBe(continuar);
  });

  it('ocupado: todas las acciones quedan inertes pero enfocables', async () => {
    const { container, props } = montar({ ocupado: true });
    await asentar();
    const botones = [...container.querySelectorAll<HTMLElement>('[role="menu"] button')];
    expect(botones.every((b) => b.getAttribute('aria-disabled') === 'true' && !b.hasAttribute('disabled'))).toBe(true);
    expect(document.activeElement).toBe(botones[0]);
    for (const b of botones) await fireEvent.click(b);
    expect(props.alReproducir).not.toHaveBeenCalled();
    expect(props.alCambiarEstado).not.toHaveBeenCalled();
    expect(props.alAlternarFavorito).not.toHaveBeenCalled();
    expect(props.alQuitar).not.toHaveBeenCalled();
  });
});
