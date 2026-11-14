import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrir, cerrarSuperior, irASeccion, nav } from './navegacion.svelte.ts';

const serie = (aid: number) => ({ aid, title: `Serie ${aid}`, slug: `serie-${aid}` });
const ficha = (aid: number) => ({ tipo: 'ficha' as const, anime: serie(aid) });
const reproducir = (aid: number) => ({ tipo: 'reproducir' as const, anime: serie(aid), numeros: [1, 2], numero: 1, idioma: 'SUB' as const });

let scrollTo: ReturnType<typeof vi.spyOn>;

/** Dónde está la página en este momento (lo que el usuario ha bajado). */
function bajarHasta(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

describe('«Volver» recuerda el desplazamiento', () => {
  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    // La página es lo bastante alta como para poder ir a cualquier posición.
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 100_000, configurable: true });
    // Los fotogramas se disparan al instante: no se espera a que el contenido cargue.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    irASeccion('biblioteca'); // pila y superior limpias
    bajarHasta(0);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    scrollTo.mockRestore();
  });

  it('de una ficha a su sección: vuelve a donde estaba la sección', () => {
    bajarHasta(800);
    abrir(ficha(1)); // sale de Biblioteca, que estaba en 800
    bajarHasta(0); // la ficha se abre arriba
    cerrarSuperior();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 800);
    expect(nav.superior).toBeNull();
  });

  it('de una ficha a la anterior (relacionada) y de ahí a la sección', () => {
    bajarHasta(300);
    abrir(ficha(10)); // sección en 300
    bajarHasta(500);
    abrir(ficha(11)); // la ficha 10 estaba en 500
    bajarHasta(0);
    cerrarSuperior(); // a la ficha 10
    expect(nav.superior).toEqual(ficha(10));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 500);
    cerrarSuperior(); // a la sección
    expect(nav.superior).toBeNull();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
  });

  it('al cerrar el Reproductor vuelve a donde estaba la ficha', () => {
    bajarHasta(300);
    abrir(ficha(20));
    bajarHasta(650);
    abrir(reproducir(20)); // la ficha estaba en 650
    bajarHasta(0); // el Reproductor no se desplaza
    abrir(ficha(20)); // cerrar el Reproductor
    expect(scrollTo).toHaveBeenLastCalledWith(0, 650);
  });

  it('pasar de un episodio al siguiente no anota ni restaura nada', () => {
    bajarHasta(100);
    abrir(ficha(30));
    bajarHasta(400);
    abrir(reproducir(30));
    scrollTo.mockClear();
    abrir({ ...reproducir(30), numero: 2 });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('abrir una ficha desde una sección empieza arriba aunque ya se hubiera visitado antes', () => {
    bajarHasta(100);
    abrir(ficha(40));
    bajarHasta(500);
    abrir(ficha(41)); // la ficha 40 queda anotada en 500
    cerrarSuperior(); // a la ficha 40 (restaura 500)
    cerrarSuperior(); // a la sección
    scrollTo.mockClear();
    bajarHasta(0);
    abrir(ficha(40)); // otra visita a la 40 desde la sección: no debe saltar a los 500 de la visita anterior
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });

  it('abrir una ficha relacionada desde otra ficha bajada del todo empieza arriba', () => {
    bajarHasta(100);
    abrir(ficha(60));
    bajarHasta(9000); // una serie larga, bajada hasta el final
    scrollTo.mockClear();
    abrir(ficha(61));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('abrir una ficha cancela una restauración que estuviera esperando', () => {
    // Sin fotogramas: la restauración de «Volver» queda pendiente, como con una ficha que tarda en cargar.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    bajarHasta(700);
    abrir(ficha(70));
    bajarHasta(0);
    cerrarSuperior(); // pendiente de restaurar 700
    scrollTo.mockClear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    abrir(ficha(71)); // otra ficha nueva: arriba, y la restauración vieja ya no debe saltar a 700
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('una vista que se dejó arriba del todo no restaura nada', () => {
    bajarHasta(0);
    abrir(ficha(50));
    scrollTo.mockClear();
    cerrarSuperior();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
