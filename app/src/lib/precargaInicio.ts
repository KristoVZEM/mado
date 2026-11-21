import { urlCaptura, urlPortada } from './imagenes.ts';

/** Tope de imágenes que se precargan: lo que se ve al abrir Inicio, no toda la biblioteca. */
export const MAX_PRECARGA = 24;

export interface EntradasInicio {
  destacados: ReadonlyArray<{ destacado: { banner: string } }>;
  pendientes: ReadonlyArray<{ aid: number; numero: number }>;
  nuevos: ReadonlyArray<{ aid: number }>;
  viendo: ReadonlyArray<{ aid: number }>;
  considerando: ReadonlyArray<{ aid: number }>;
  /** El banner de AniList de una serie, si lo hay: la tarjeta de «Continuar viendo» lo prefiere a la captura. */
  bannerDe: (aid: number) => string | null;
}

const esHttps = (u: unknown): u is string => typeof u === 'string' && u.startsWith('https://');

/**
 * Las imágenes de lo que se ve nada más abrir Inicio, en orden de importancia: banners de la cabecera, capturas (o
 * banners) de «Continuar viendo» y pósters de las filas. Sin repetidas y solo direcciones https, hasta `MAX_PRECARGA`.
 * Pide las mismas direcciones que pintan las tarjetas, para que el navegador las encuentre ya descargadas.
 */
export function urlsDeInicio(e: EntradasInicio): string[] {
  // El tope de cada fila se aplica DESPUÉS de descartar lo que no vale: una imagen mala no gasta un sitio.
  const primeras = <T>(lista: readonly T[], max: number, url: (x: T) => string | null | undefined): string[] =>
    lista.map(url).filter(esHttps).slice(0, max);
  const candidatas: string[] = [
    ...primeras(e.destacados, 3, (d) => d.destacado.banner),
    ...primeras(e.pendientes, 6, (p) => e.bannerDe(p.aid) ?? urlCaptura(p.aid, p.numero)),
    ...primeras(e.nuevos, 8, (s) => urlPortada(s.aid)),
    ...primeras(e.viendo, 8, (s) => urlPortada(s.aid)),
    ...primeras(e.considerando, 8, (s) => urlPortada(s.aid)),
  ];
  const vistas = new Set<string>();
  const urls: string[] = [];
  for (const u of candidatas) {
    if (vistas.has(u)) continue;
    vistas.add(u);
    urls.push(u);
    if (urls.length >= MAX_PRECARGA) break;
  }
  return urls;
}

/**
 * Un precargador que pide cada imagen una sola vez (también entre llamadas, por ejemplo al refrescar Inicio). Un fallo al
 * pedir una no impide pedir las demás: es una ayuda, nunca un error.
 */
export function crearPrecargador(crear: (url: string) => void) {
  const pedidas = new Set<string>();
  return (urls: readonly string[]): void => {
    for (const u of urls) {
      if (pedidas.has(u)) continue;
      pedidas.add(u);
      try {
        crear(u);
      } catch {
        // Sin imagen precargada la tarjeta la pide cuando haga falta.
      }
    }
  };
}

/** Descarga la imagen con un `Image` fuera de la página: funciona aunque la ventana esté oculta y `loading="lazy"` espere. */
export const precargarImagenes = crearPrecargador((url) => {
  const imagen = new Image();
  imagen.src = url;
});
