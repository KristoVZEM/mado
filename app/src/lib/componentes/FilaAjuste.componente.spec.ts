import { describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render, screen } from '@testing-library/svelte';
import FilaAjuste from './FilaAjuste.svelte';

const control = createRawSnippet(() => ({ render: () => '<input id="volumen" />' }));

describe('FilaAjuste', () => {
  it('une el título al control y muestra la ayuda', () => {
    render(FilaAjuste, { titulo: 'Volumen', ayuda: 'Nivel inicial', id: 'volumen', children: control });
    expect(screen.getByLabelText('Volumen')).toBeTruthy();
    expect(screen.getByText('Nivel inicial')).toBeTruthy();
  });

  it('sin ayuda no pinta el párrafo de ayuda', () => {
    const { container } = render(FilaAjuste, { titulo: 'Volumen', id: 'volumen', children: control });
    expect(container.querySelector('.ayuda')).toBeNull();
  });
});
