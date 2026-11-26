import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import Biblioteca from './Biblioteca.svelte';
import type { EntradaBiblioteca, ResumenSerie } from '../lib/datos.ts';
import { ajustes } from '../lib/ajustes.svelte.ts';
import { nav } from '../lib/navegacion.svelte.ts';
import { backendVacio } from '../pruebas/datos.ts';
import { llamadasA, reiniciarTauri, responder } from '../pruebas/tauriFalso.ts';
import { asentar, reiniciarNavegacion, vigilarConsola } from '../pruebas/vigilar.ts';

const e = (aid: number, titulo: string, estado: number | null, extra: Partial<EntradaBiblioteca> = {}): EntradaBiblioteca => ({
  aid, slug: `serie-${aid}`, titulo, estado, ultimoEpisodio: null, vistoEn: null, vistos: 0, total: null, puntuacion: null, generos: [],
  ...extra,
});

const BASE = {
  siguiendo: [
    e(1, 'Akira', 1, { vistoEn: 100 }),
    e(2, 'Bleach', 1, { vistoEn: 300, generos: ['Action'] }),
    e(3, 'Naruto', 3, { vistoEn: 200 }),
  ],
  favoritos: [e(2, 'Bleach', 1, { vistoEn: 300, generos: ['Action'] }), e(4, 'Pokémon', null)],
};

const titulos = (c: HTMLElement) => [...c.querySelectorAll('.cuadricula strong')].map((x) => x.textContent);

describe('Biblioteca', () => {
  let consola: ReturnType<typeof vigilarConsola>;
  beforeEach(() => {
    reiniciarTauri();
    reiniciarNavegacion();
    backendVacio();
    responder('listar_biblioteca', BASE);
    ajustes.ordenBiblioteca = 'ultimo';
    consola = vigilarConsola();
  });
  afterEach(() => consola.parar());

  it('Todas incluye el favorito sin estado y ordena por último visto', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    expect(titulos(container)).toEqual(['Bleach', 'Naruto', 'Akira', 'Pokémon']);
    expect(container.querySelector('#pestana-todos')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Todas (4)');
    expect(consola.mensajes()).toEqual([]);
  });

  it('las flechas, Inicio y Fin mueven la pestaña y el foco', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    const todas = container.querySelector<HTMLElement>('#pestana-todos')!;
    todas.focus();
    await fireEvent.keyDown(todas, { key: 'ArrowRight' });
    await asentar();
    const viendo = container.querySelector('#pestana-viendo')!;
    expect(viendo.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(viendo);
    expect(titulos(container)).toEqual(['Bleach', 'Akira']);
    await fireEvent.keyDown(viendo, { key: 'End' });
    await asentar();
    expect(container.querySelector('#pestana-pausado')!.getAttribute('aria-selected')).toBe('true');
    await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    await asentar();
    expect(document.activeElement).toBe(container.querySelector('#pestana-todos'));
  });

  it('cambiar el orden lo aplica y lo guarda', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    const orden = container.querySelector<HTMLSelectElement>('select[aria-label="Ordenar por"]')!;
    await fireEvent.change(orden, { target: { value: 'titulo' } });
    await asentar();
    expect(titulos(container)).toEqual(['Akira', 'Bleach', 'Naruto', 'Pokémon']);
    expect(llamadasA('guardar_ajuste')).toContainEqual({ clave: 'biblioteca_orden', valor: '3' });
  });

  it('buscar filtra sin tildes, Esc vacía y Ctrl+F lleva al campo', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    const campo = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(document.activeElement).toBe(campo);
    await fireEvent.input(campo, { target: { value: 'pokemon' } });
    await asentar();
    expect(titulos(container)).toEqual(['Pokémon']);
    expect(container.textContent).toContain('1 de 4 series');
    await fireEvent.keyDown(campo, { key: 'Escape' });
    await asentar();
    expect(titulos(container)).toHaveLength(4);
  });

  it('el filtro de favoritos y el de género se combinan con la pestaña', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    const favoritos = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('★ Favoritos'))!;
    await fireEvent.click(favoritos);
    await asentar();
    expect(titulos(container)).toEqual(['Bleach', 'Pokémon']);
    const genero = container.querySelector<HTMLSelectElement>('select[aria-label="Género"]')!;
    await fireEvent.change(genero, { target: { value: 'Action' } });
    await asentar();
    expect(titulos(container)).toEqual(['Bleach']);
  });

  it('el clic derecho y Shift+F10 abren el menú de la serie', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    const tarjeta = container.querySelector<HTMLElement>('li[data-aid="1"] .tarjeta')!;
    await fireEvent.contextMenu(tarjeta);
    await asentar();
    expect(container.querySelector('li[data-aid="1"] [role="menu"]')).not.toBeNull();
    await fireEvent.keyDown(window, { key: 'Escape' });
    await asentar();
    await fireEvent.keyDown(tarjeta, { key: 'F10', shiftKey: true });
    await asentar();
    expect(container.querySelector('li[data-aid="1"] [role="menu"]')).not.toBeNull();
  });

  it('cambiar el estado desde el menú lo guarda, avisa y saca la serie de la pestaña', async () => {
    nav.biblioteca.pestana = 'viendo';
    const { container } = render(Biblioteca);
    await asentar();
    await fireEvent.click(container.querySelector('li[data-aid="1"] .mas')!);
    await asentar();
    const completado = [...container.querySelectorAll('li[data-aid="1"] [role="menuitemradio"]')].find((b) => b.textContent?.includes('Completado'))!;
    await fireEvent.click(completado);
    await asentar();
    expect(llamadasA('fijar_estado')).toContainEqual({ aid: 1, slug: 'serie-1', titulo: 'Akira', estado: 3 });
    expect(titulos(container)).toEqual(['Bleach']);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('Akira pasó a Completado');
  });

  it('si guardar el estado falla, la serie vuelve y se avisa', async () => {
    responder('fijar_estado', () => {
      throw new Error('disco lleno');
    });
    nav.biblioteca.pestana = 'viendo';
    const { container } = render(Biblioteca);
    await asentar();
    await fireEvent.click(container.querySelector('li[data-aid="1"] .mas')!);
    await asentar();
    const completado = [...container.querySelectorAll('li[data-aid="1"] [role="menuitemradio"]')].find((b) => b.textContent?.includes('Completado'))!;
    await fireEvent.click(completado);
    await asentar();
    expect(titulos(container)).toEqual(['Bleach', 'Akira']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('No se pudo guardar el estado');
    expect(consola.mensajes().some((m) => m.includes('disco lleno'))).toBe(true);
  });
  const menuDe = async (container: HTMLElement, aid: number) => {
    await fireEvent.click(container.querySelector(`li[data-aid="${aid}"] .mas`)!);
    await asentar();
  };
  const opcion = (container: HTMLElement, aid: number, texto: string) =>
    [...container.querySelectorAll(`li[data-aid="${aid}"] [role^="menuitem"]`)].find((b) => b.textContent?.includes(texto))!;

  it('alternar favorito desde el menú lo guarda y lo anuncia', async () => {
    responder('alternar_favorito', true);
    const { container } = render(Biblioteca);
    await asentar();
    await menuDe(container, 1);
    await fireEvent.click(opcion(container, 1, 'avorito'));
    await asentar();
    expect(llamadasA('alternar_favorito')).toHaveLength(1);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('Akira se añadió a favoritos');
  });

  it('quitar de la biblioteca un favorito con estado lo deja en Todas sin estado', async () => {
    const { container } = render(Biblioteca);
    await asentar();
    await menuDe(container, 2);
    await fireEvent.click(opcion(container, 2, 'Quitar de la biblioteca'));
    await asentar();
    await fireEvent.click(opcion(container, 2, 'Pulsa otra vez'));
    await asentar();
    expect(llamadasA('fijar_estado')).toContainEqual({ aid: 2, slug: 'serie-2', titulo: 'Bleach', estado: 0 });
    expect(titulos(container)).toContain('Bleach');
    expect(container.querySelector('#pestana-viendo')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Viendo (1)');
  });

  it('el aviso de episodios nuevos lleva a Todas y filtra', async () => {
    responder('resumenes_vinculados', [
      { aid: 3, anilistId: 30, confianza: 0.9, origen: 'auto', banner: null, portada: null, siguienteEp: 6, siguienteEn: null, episodios: null, estado: 'RELEASING' } satisfies ResumenSerie,
    ]);
    nav.biblioteca.pestana = 'viendo';
    const { container } = render(Biblioteca);
    await asentar();
    const boton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('con episodio nuevo'))!;
    await fireEvent.click(boton);
    await asentar();
    expect(container.querySelector('#pestana-todos')!.getAttribute('aria-selected')).toBe('true');
    expect(titulos(container)).toEqual(['Naruto']);
  });
});
