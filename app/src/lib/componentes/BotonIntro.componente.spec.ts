import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import BotonIntro from './BotonIntro.svelte';

describe('BotonIntro', () => {
  it('con visible se ve el botón y pulsarlo avisa', async () => {
    const alSaltar = vi.fn();
    render(BotonIntro, { visible: true, alto: false, alSaltar });
    await fireEvent.click(screen.getByRole('button', { name: /Saltar intro/ }));
    expect(alSaltar).toHaveBeenCalledTimes(1);
  });

  it('sin visible no hay botón', () => {
    render(BotonIntro, { visible: false, alto: false, alSaltar: vi.fn() });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('con los controles a la vista se sube para no taparlos', () => {
    render(BotonIntro, { visible: true, alto: true, alSaltar: vi.fn() });
    expect(screen.getByRole('button', { name: /Saltar intro/ }).classList.contains('alto')).toBe(true);
  });
});
