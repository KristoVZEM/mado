import type { Idioma, ResultadoBusqueda } from '../../../core/src/index.ts';
import type { Pestana } from './biblioteca.ts';
import { SECCION_INICIAL, type Seccion } from './carril.ts';
import type { ListadoId } from './listados.ts';
import { pilaAlAbrir, pilaAlVolver } from './pila.ts';
import { claveDeVista } from './desplazamiento.ts';
import { irArriba, recordarDesplazamiento, restaurarDesplazamiento } from './desplazamientoApp.ts';

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
    /** Sube cada vez que se pide la búsqueda (Ctrl+K): el Catálogo pone el cursor en su campo. */
    enfoque: number;
  };
  pestana: Pestana;
}

export const nav = $state<Estado>({
  seccion: SECCION_INICIAL,
  superior: null,
  catalogo: { texto: '', resultados: [], buscado: false, pendiente: false, listados: {}, abierto: null, enfoque: 0 },
  pestana: 'todos',
});

/** Fichas por las que se pasó hasta la actual; «Volver» las recorre hacia atrás. Detalle en `pila.ts`. */
let pila: Superior[] = [];

export function irASeccion(seccion: Seccion): void {
  pila = [];
  nav.superior = null;
  nav.seccion = seccion;
}

export function abrir(superior: Superior): void {
  // Se anota hasta dónde se había bajado en lo que se deja: al volver se recupera. Se hace antes de cambiar nada,
  // porque al desmontarse la pantalla la página se encoge y la posición se perdería.
  recordarDesplazamiento(claveDeVista(nav.superior, nav.seccion));
  const vieneDelReproductor = nav.superior?.tipo === 'reproducir';
  pila = pilaAlAbrir(pila, nav.superior, superior);
  nav.superior = superior;
  // Cerrar el Reproductor devuelve a la Ficha donde estaba; abrir una ficha desde cualquier otro sitio empieza arriba.
  if (superior.tipo !== 'ficha') return;
  if (vieneDelReproductor) restaurarDesplazamiento(claveDeVista(superior, nav.seccion));
  else irArriba();
}

/** «Volver» desde una ficha: a la ficha anterior si se llegó desde otra, o a la sección de origen. */
export function cerrarSuperior(): void {
  const r = pilaAlVolver(pila);
  pila = r.pila;
  nav.superior = r.destino;
  restaurarDesplazamiento(claveDeVista(nav.superior, nav.seccion));
}

/** Ctrl+K: va al Catálogo con el cursor en el campo de búsqueda. */
export function irABusqueda(): void {
  nav.catalogo.enfoque++;
  irASeccion('catalogo');
}

/** Va a Catálogo con el texto puesto; Catálogo lanza la búsqueda al montarse. */
export function buscarEnCatalogo(texto: string): void {
  nav.catalogo.texto = texto;
  nav.catalogo.pendiente = true;
  nav.catalogo.abierto = null;
  irASeccion('catalogo');
}
