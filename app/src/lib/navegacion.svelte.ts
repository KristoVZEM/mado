import type { Idioma, ResultadoBusqueda } from '../../../core/src/index.ts';
import type { Pestana } from './biblioteca.ts';
import { SECCION_INICIAL, type Seccion } from './carril.ts';
import type { ListadoId } from './listados.ts';

/** Lo que se abre encima de una sección. El Reproductor sale del armazón y ocupa toda la ventana. */
export type Superior =
  | { tipo: 'ficha'; anime: ResultadoBusqueda }
  | {
      tipo: 'reproducir';
      anime: ResultadoBusqueda;
      /** Números de todos los episodios, ordenados: sirven para calcular el siguiente. */
      numeros: number[];
      numero: number;
      idioma: Idioma;
    };

interface Estado {
  seccion: Seccion;
  superior: Superior | null;
  /** Se conserva al cambiar de sección (mientras la app está abierta). */
  catalogo: {
    texto: string;
    resultados: ResultadoBusqueda[];
    buscado: boolean;
    pendiente: boolean;
    /** Filas ya cargadas del Catálogo; `pagina` es la última pedida y `fin` que no quedan más. */
    listados: Partial<Record<ListadoId, { resultados: ResultadoBusqueda[]; pagina: number; fin: boolean }>>;
    /** El listado que se está viendo entero, o `null` para ver las filas. */
    abierto: ListadoId | null;
  };
  pestana: Pestana;
}

export const nav = $state<Estado>({
  seccion: SECCION_INICIAL,
  superior: null,
  catalogo: { texto: '', resultados: [], buscado: false, pendiente: false, listados: {}, abierto: null },
  pestana: 'todos',
});

export function irASeccion(seccion: Seccion): void {
  nav.superior = null;
  nav.seccion = seccion;
}

export function abrir(superior: Superior): void {
  nav.superior = superior;
}

export function cerrarSuperior(): void {
  nav.superior = null;
}

/** Va a Catálogo con el texto puesto; Catálogo lanza la búsqueda al montarse. */
export function buscarEnCatalogo(texto: string): void {
  nav.catalogo.texto = texto;
  nav.catalogo.pendiente = true;
  nav.catalogo.abierto = null;
  irASeccion('catalogo');
}
