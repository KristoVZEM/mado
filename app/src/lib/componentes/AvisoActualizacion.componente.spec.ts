import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { check } from '@tauri-apps/plugin-updater';
import AvisoActualizacion from './AvisoActualizacion.svelte';
import { actualizacion, buscarActualizacion, instalarActualizacion } from '../actualizacion.svelte.ts';

type Evento = { event: 'Started'; data: { contentLength?: number } } | { event: 'Progress'; data: { chunkLength: number } } | { event: 'Finished' };

/** Una versión nueva falsa que anota en `orden` lo que se le pide, para comprobar el orden y el progreso. */
function versionNueva(orden: string[], fallo?: Error, body?: string) {
  return {
    version: '0.12.1',
    body,
    download: vi.fn(async (alEvento?: (e: Evento) => void) => {
      orden.push('descargar');
      if (fallo) throw fallo;
      alEvento?.({ event: 'Started', data: { contentLength: 100 } });
      alEvento?.({ event: 'Progress', data: { chunkLength: 40 } });
      alEvento?.({ event: 'Finished' });
    }),
    install: vi.fn(async () => {
      orden.push('instalar');
    }),
  };
}

function hayVersion(u: ReturnType<typeof versionNueva> | null) {
  vi.mocked(check).mockResolvedValueOnce(u as never);
}

beforeEach(() => {
  Object.assign(actualizacion, { estado: 'inactivo', version: '', porcentaje: null, descartado: false, mensaje: '', notas: null });
});

describe('AvisoActualizacion', () => {
  it('sin versión nueva no pinta nada', async () => {
    hayVersion(null);
    await buscarActualizacion(false);
    const { container } = render(AvisoActualizacion);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(actualizacion.estado).toBe('inactivo');
  });

  it('con una versión nueva avisa y ofrece actualizar o dejarlo para luego', async () => {
    hayVersion(versionNueva([]));
    await buscarActualizacion(false);
    render(AvisoActualizacion);
    expect(screen.getByRole('status').textContent).toContain('Mado 0.12.1 está lista.');
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Más tarde' })).toBeTruthy();
  });

  it('«Más tarde» quita el aviso sin instalar nada', async () => {
    const u = versionNueva([]);
    hayVersion(u);
    await buscarActualizacion(false);
    const { container } = render(AvisoActualizacion);
    await fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(u.download).not.toHaveBeenCalled();
    expect(u.install).not.toHaveBeenCalled();
  });

  it('«Actualizar» descarga, enseña el progreso y solo después instala', async () => {
    const orden: string[] = [];
    hayVersion(versionNueva(orden));
    await buscarActualizacion(false);
    render(AvisoActualizacion);
    await fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await vi.waitFor(() => expect(orden).toEqual(['descargar', 'instalar']));
    expect(actualizacion.porcentaje).toBe(40);
  });

  it('no instala mientras hay un episodio reproduciéndose', async () => {
    const u = versionNueva([]);
    hayVersion(u);
    await buscarActualizacion(false);
    await instalarActualizacion(() => true);
    expect(u.download).not.toHaveBeenCalled();
    expect(actualizacion.estado).toBe('disponible');
  });

  it('si empieza un episodio durante la descarga, espera a que termine para instalar', async () => {
    const orden: string[] = [];
    hayVersion(versionNueva(orden));
    await buscarActualizacion(false);
    let consultas = 0;
    // La primera consulta (antes de descargar) deja pasar; la segunda (ya descargada) encuentra un episodio en marcha.
    await instalarActualizacion(() => ++consultas > 1);
    expect(orden).toEqual(['descargar']);
    expect(actualizacion.estado).toBe('descargada');
    await instalarActualizacion(() => false);
    expect(orden).toEqual(['descargar', 'instalar']); // no vuelve a descargar
  });

  it('si falla la descarga lo dice sin datos de la petición y deja reintentar', async () => {
    hayVersion(versionNueva([], new Error('error sending request for url (https://x/y?token=secreto)')));
    await buscarActualizacion(false);
    render(AvisoActualizacion);
    await fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).not.toMatch(/secreto|https?:/);
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('un fallo de red al comprobar a mano se explica; al abrir no molesta', async () => {
    vi.mocked(check).mockRejectedValueOnce(new Error('error sending request for url (https://x/latest.json)'));
    await buscarActualizacion(true);
    expect(actualizacion.mensaje).toMatch(/conexión/);
    vi.mocked(check).mockRejectedValueOnce(new Error('error sending request for url (https://x/latest.json)'));
    Object.assign(actualizacion, { mensaje: '' });
    await buscarActualizacion(false);
    expect(actualizacion.mensaje).toBe('');
  });

  it('sin release publicada la comprobación a mano dice «al día», no un error', async () => {
    vi.mocked(check).mockRejectedValueOnce(new Error('Could not fetch a valid release JSON from the remote'));
    await buscarActualizacion(true);
    expect(actualizacion.mensaje).toBe('Estás al día.');
  });

  describe('novedades de la versión', () => {
    const NOTAS = 'Mado salta intros.\n\n### Nuevo\n\n- **Saltar intro.** Un botón opcional.\n- Episodios paginados.';

    it('con notas ofrece «Novedades» y las enseña solo al pulsarlo', async () => {
      hayVersion(versionNueva([], undefined, NOTAS));
      await buscarActualizacion(false);
      render(AvisoActualizacion);
      expect(screen.queryByText('Episodios paginados.')).toBeNull();
      const boton = screen.getByRole('button', { name: 'Novedades' });
      expect(boton.getAttribute('aria-expanded')).toBe('false');
      await fireEvent.click(boton);
      expect(boton.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText('Episodios paginados.')).toBeTruthy();
      expect(screen.getByText('Saltar intro.').tagName).toBe('STRONG');
      expect(screen.getByRole('heading', { name: 'Nuevo' })).toBeTruthy();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('volver a pulsar «Novedades» las esconde', async () => {
      hayVersion(versionNueva([], undefined, NOTAS));
      await buscarActualizacion(false);
      render(AvisoActualizacion);
      const boton = screen.getByRole('button', { name: 'Novedades' });
      await fireEvent.click(boton);
      await fireEvent.click(boton);
      expect(screen.queryByText('Episodios paginados.')).toBeNull();
    });

    it('sin notas no hay botón «Novedades»', async () => {
      hayVersion(versionNueva([]));
      await buscarActualizacion(false);
      render(AvisoActualizacion);
      expect(screen.queryByRole('button', { name: 'Novedades' })).toBeNull();
    });

    it('unas notas vacías o que no son texto tampoco lo ofrecen', async () => {
      for (const malas of ['', '   \n ', 42 as unknown as string]) {
        hayVersion(versionNueva([], undefined, malas));
        await buscarActualizacion(false);
        expect(actualizacion.notas).toBeNull();
      }
    });

    it('el HTML de las notas se enseña como texto: no crea elementos', async () => {
      hayVersion(versionNueva([], undefined, '- <img src=x onerror=alert(1)> y <b>negrita</b> [enlace](https://malo.test)'));
      await buscarActualizacion(false);
      const { container } = render(AvisoActualizacion);
      await fireEvent.click(screen.getByRole('button', { name: 'Novedades' }));
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('b')).toBeNull();
      expect(container.querySelector('a')).toBeNull();
      expect(screen.getByRole('listitem').textContent).toBe('<img src=x onerror=alert(1)> y <b>negrita</b> enlace');
    });

    it('al buscar de nuevo y no haber versión, las notas de la anterior se van', async () => {
      hayVersion(versionNueva([], undefined, NOTAS));
      await buscarActualizacion(false);
      expect(actualizacion.notas).toBe(NOTAS);
      hayVersion(null);
      await buscarActualizacion(false);
      expect(actualizacion.notas).toBeNull();
    });
  });
});
