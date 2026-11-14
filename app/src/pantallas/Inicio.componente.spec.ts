import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import Inicio from './Inicio.svelte';
import type { EntradaBiblioteca, ResumenSerie } from '../lib/datos.ts';
import { backendVacio } from '../pruebas/datos.ts';
import { reiniciarTauri, responder } from '../pruebas/tauriFalso.ts';
import { asentar, reiniciarNavegacion, vigilarConsola } from '../pruebas/vigilar.ts';

const serie = (aid: number, titulo: string, estado: number): EntradaBiblioteca => ({
  aid,
  slug: `serie-${aid}`,
  titulo,
  estado,
  ultimoEpisodio: 2,
});
const resumen = (aid: number, extra: Partial<ResumenSerie>): ResumenSerie => ({
  aid,
  anilistId: aid * 10,
  confianza: 0.9,
  origen: 'auto',
  banner: null,
  portada: null,
  siguienteEp: null,
  siguienteEn: null,
  episodios: null,
  estado: null,
  ...extra,
});

describe('Inicio: fila «Nuevos episodios»', () => {
  let consola: ReturnType<typeof vigilarConsola>;
  beforeEach(() => {
    reiniciarTauri();
    reiniciarNavegacion();
    backendVacio();
    consola = vigilarConsola();
  });
  afterEach(() => consola.parar());

  it('incluye las series en Considerando con un episodio nuevo, después de las de Viendo', async () => {
    responder('listar_biblioteca', {
      siguiendo: [
        serie(2, 'Pendiente con novedad', 2),
        serie(1, 'Viendo con novedad', 1),
        serie(3, 'Pendiente terminada', 2),
        serie(4, 'Pendiente al día', 2),
      ],
      favoritos: [],
    });
    responder('resumenes_vinculados', [
      resumen(1, { estado: 'RELEASING', siguienteEp: 6 }), // emitido 5, viste 2: nuevo
      resumen(2, { estado: 'RELEASING', siguienteEp: 6 }), // nuevo
      resumen(3, { estado: 'FINISHED', episodios: 12 }), // terminada: no es nuevo
      resumen(4, { estado: 'RELEASING', siguienteEp: 3 }), // emitido 2, viste 2: al día
    ]);
    const { container } = render(Inicio);
    await asentar();

    const fila = container.querySelector('section[aria-label="Nuevos episodios"]');
    expect(fila).not.toBeNull();
    const texto = fila!.textContent ?? '';
    expect(texto).toContain('Viendo con novedad');
    expect(texto).toContain('Pendiente con novedad');
    expect(texto).not.toContain('Pendiente terminada');
    expect(texto).not.toContain('Pendiente al día');
    // Viendo primero, aunque la de Considerando viniera antes en la biblioteca.
    expect(texto.indexOf('Viendo con novedad')).toBeLessThan(texto.indexOf('Pendiente con novedad'));
    expect(consola.mensajes()).toEqual([]);
  });
});
