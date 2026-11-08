import type { Idioma, ResultadoBusqueda } from '../../../core/src/index.ts';

export type Pantalla =
  | { tipo: 'buscar' }
  | { tipo: 'biblioteca' }
  | { tipo: 'ficha'; anime: ResultadoBusqueda }
  | {
      tipo: 'reproducir';
      anime: ResultadoBusqueda;
      /** Números de todos los episodios, ordenados: sirven para calcular el siguiente. */
      numeros: number[];
      numero: number;
      idioma: Idioma;
    };

/** Estado de navegación: una sola pantalla activa, sin librería de rutas. */
export const nav = $state<{ pantalla: Pantalla }>({ pantalla: { tipo: 'buscar' } });

export function irA(pantalla: Pantalla): void {
  nav.pantalla = pantalla;
}
