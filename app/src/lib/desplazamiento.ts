// Recordar hasta dónde se había bajado en una pantalla para recuperarlo al volver (Alt+←, botón atrás del ratón,
// cerrar el Reproductor). Funciones puras: el estado del navegador (`window.scrollY`, fotogramas, eventos) lo
// aporta `desplazamientoApp.ts`.

/** Posiciones que se recuerdan como mucho; al pasar el tope se olvida la más antigua. */
export const TOPE_MEMORIA = 30;

/** Lo mínimo que hace falta saber de lo que hay encima de una sección para ponerle clave. */
export interface VistaSuperior {
  tipo: 'ficha' | 'reproducir';
  anime: { aid: number };
}

/**
 * Cómo se identifica una vista: `ficha:<aid>` o `seccion:<nombre>`. El Reproductor no tiene: ocupa toda la ventana y
 * no se desplaza, así que nada que recordar.
 */
export function claveDeVista(superior: VistaSuperior | null, seccion: string): string | null {
  if (superior === null) return `seccion:${seccion}`;
  return superior.tipo === 'ficha' ? `ficha:${superior.anime.aid}` : null;
}

export interface Memoria {
  guardar(clave: string, y: number): void;
  leer(clave: string): number | undefined;
}

/** Posiciones por vista. `0` (arriba del todo) no se guarda: borra lo que hubiera. */
export function crearMemoria(tope = TOPE_MEMORIA): Memoria {
  const m = new Map<string, number>();
  return {
    guardar(clave, y) {
      m.delete(clave); // al volver a insertarla pasa a ser la más reciente
      if (!(y > 0)) return;
      m.set(clave, y);
      while (m.size > tope) m.delete(m.keys().next().value as string);
    },
    leer: (clave) => m.get(clave),
  };
}

export interface EntornoRestaurador {
  /** Lo más abajo que se puede estar ahora mismo (alto de la página menos el de la ventana). */
  maximo: () => number;
  desplazarA: (y: number) => void;
  /** Reloj en milisegundos. */
  ahora: () => number;
  siguienteFotograma: (cb: () => void) => void;
  /** Cuánto se espera a que la página crezca antes de conformarse con lo que haya. */
  tope?: number;
}

export interface Restaurador {
  iniciar(y: number): void;
  cancelar(): void;
}

/**
 * Lleva la página a `y`, pero las pantallas cargan su contenido después de montarse: hasta que la página no mide
 * lo suficiente, saltar no llegaría. Se reintenta en cada fotograma; al pasar el tope se va a lo máximo que haya.
 */
export function crearRestaurador(entorno: EntornoRestaurador): Restaurador {
  const tope = entorno.tope ?? 1500;
  let turno = 0; // cada `iniciar` o `cancelar` invalida los fotogramas pendientes del anterior
  return {
    iniciar(y) {
      const mio = ++turno;
      const desde = entorno.ahora();
      const paso = () => {
        if (mio !== turno) return;
        if (entorno.maximo() >= y) return entorno.desplazarA(y);
        if (entorno.ahora() - desde >= tope) return entorno.desplazarA(Math.max(0, entorno.maximo()));
        entorno.siguienteFotograma(paso);
      };
      entorno.siguienteFotograma(paso);
    },
    cancelar() {
      turno++;
    },
  };
}
