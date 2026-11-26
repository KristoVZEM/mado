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
});
