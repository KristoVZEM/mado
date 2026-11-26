import type { Biblioteca, EntradaBiblioteca } from './datos.ts';
import { PESTANAS, type Pestana } from './biblioteca.ts';
import { coincide } from './busquedaLocal.ts';
import { generoEnEspanol } from './generos.ts';

/** Una serie tal como la enseña la Biblioteca: lo de Rust más si está en favoritos. */
export interface EntradaVista extends EntradaBiblioteca {
  favorito: boolean;
}

export type Orden = 'ultimo' | 'progreso' | 'puntuacion' | 'titulo';

/** En el orden del ajuste `biblioteca_orden` (la posición es el número guardado). */
export const ORDENES: readonly { id: Orden; nombre: string }[] = [
  { id: 'ultimo', nombre: 'Último visto' },
  { id: 'progreso', nombre: 'Progreso' },
  { id: 'puntuacion', nombre: 'Puntuación' },
  { id: 'titulo', nombre: 'Título' },
];

/** Del valor guardado al orden; cualquier cosa que no sea 0-3 es «último visto». */
export function ordenDe(valor: string | null): Orden {
  const n = Number(valor ?? '');
  return Number.isInteger(n) && n >= 0 && n < ORDENES.length ? ORDENES[n].id : 'ultimo';
}

export function valorDeOrden(o: Orden): string {
  return String(Math.max(0, ORDENES.findIndex((x) => x.id === o)));
}

/** Parte vista (0-1); `null` si no se conoce el total o no se ha visto nada. */
export function fraccion(e: EntradaBiblioteca): number | null {
  if (e.total === null || e.total <= 0 || e.vistos <= 0) return null;
  return Math.min(e.vistos / e.total, 1);
}

const porTitulo = (a: EntradaBiblioteca, z: EntradaBiblioteca) => a.titulo.localeCompare(z.titulo, 'es') || a.aid - z.aid;

/** Comparador de mayor a menor con los `null` al final. */
function descendente(valor: (e: EntradaVista) => number | null) {
  return (a: EntradaVista, z: EntradaVista): number => {
    const x = valor(a);
    const y = valor(z);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return y - x;
  };
}

const CLAVES: Record<Orden, (a: EntradaVista, z: EntradaVista) => number> = {
  ultimo: descendente((e) => e.vistoEn),
  progreso: descendente(fraccion),
  puntuacion: descendente((e) => e.puntuacion),
  titulo: () => 0,
};

/** Copia ordenada; los empates siempre por título y después por `aid`. */
export function ordenar(lista: readonly EntradaVista[], o: Orden): EntradaVista[] {
  return [...lista].sort((a, z) => CLAVES[o](a, z) || porTitulo(a, z));
}

/** Una lista por `aid`: lo seguido (con su marca de favorito) y después los favoritos que no se siguen. */
export function unir(b: Biblioteca): EntradaVista[] {
  const favoritos = new Set(b.favoritos.map((f) => f.aid));
  const seguidas = new Set(b.siguiendo.map((s) => s.aid));
  return [
    ...b.siguiendo.map((e) => ({ ...e, favorito: favoritos.has(e.aid) })),
    ...b.favoritos.filter((f) => !seguidas.has(f.aid)).map((f) => ({ ...f, favorito: true })),
  ];
}

/** Las de una pestaña: Todas es la lista entera; las demás, las de su estado. */
export function dePestana(lista: readonly EntradaVista[], p: Pestana): EntradaVista[] {
  if (p === 'todos') return [...lista];
  const estado = PESTANAS.find((x) => x.id === p)?.estado;
  return lista.filter((e) => e.estado === estado);
}

/** Total de cada pestaña, sin filtros. */
export function recuentosVista(lista: readonly EntradaVista[]): Record<Pestana, number> {
  return Object.fromEntries(PESTANAS.map((p) => [p.id, dePestana(lista, p.id).length])) as Record<Pestana, number>;
}

export interface Filtros {
  texto: string;
  soloFavoritos: boolean;
  soloNuevos: boolean;
  /** Género de AniList en inglés (como viene), o `null` para todos. */
  genero: string | null;
}

export const SIN_FILTROS: Filtros = { texto: '', soloFavoritos: false, soloNuevos: false, genero: null };

export function hayFiltros(f: Filtros): boolean {
  return f.texto.trim() !== '' || f.soloFavoritos || f.soloNuevos || f.genero !== null;
}

/**
 * Lo que pasa todos los filtros. `tieneNuevo` decide «Con nuevos» (la pantalla usa el mismo criterio que la marca
 * «Nuevo»). La búsqueda no pide mínimo de letras: la lista es local y pequeña.
 */
export function aplicarFiltros(
  lista: readonly EntradaVista[],
  f: Filtros,
  tieneNuevo: (e: EntradaVista) => boolean,
): EntradaVista[] {
  const texto = f.texto.trim();
  return lista.filter(
    (e) =>
      (texto === '' || coincide(texto, e.titulo)) &&
      (!f.soloFavoritos || e.favorito) &&
      (!f.soloNuevos || tieneNuevo(e)) &&
      (f.genero === null || e.generos.includes(f.genero)),
  );
}

/** Géneros de las series de la lista, una vez cada uno, con su nombre en español y en orden alfabético. */
export function generosOfrecidos(lista: readonly EntradaBiblioteca[]): { valor: string; nombre: string }[] {
  return [...new Set(lista.flatMap((e) => e.generos))]
    .map((valor) => ({ valor, nombre: generoEnEspanol(valor) }))
    .sort((a, z) => a.nombre.localeCompare(z.nombre, 'es'));
}
