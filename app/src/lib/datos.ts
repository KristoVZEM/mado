import { invoke } from '@tauri-apps/api/core';

/** Identifica una serie para guardar su progreso; `aid` y `slug` son los de animeav1. */
export interface SerieRef {
  aid: number;
  slug: string;
  titulo: string;
}

/** Una tarjeta de "Continuar viendo" tal como la devuelve Rust (camelCase). */
export interface EntradaContinuar {
  aid: number;
  slug: string;
  titulo: string;
  numero: number;
  posicionS: number;
  duracionS: number;
  actualizado: number;
}

// Envoltorios finos de los comandos de Rust (src-tauri/src/datos/comandos.rs). Los argumentos van en
// camelCase. `numero` y `siguiente` salen siempre de la lista de episodios: nunca se calculan,
// porque la clave en la base es un número real y la comparación es exacta.

/** `null` si la base funciona; si no, el motivo (p. ej. es de una versión más nueva). */
export const estadoDatos = () => invoke<string | null>('estado_datos');

export const guardarProgreso = (serie: SerieRef, numero: number, posicionS: number, duracionS: number) =>
  invoke<void>('guardar_progreso', {
    aid: serie.aid,
    slug: serie.slug,
    titulo: serie.titulo,
    numero,
    posicionS,
    duracionS,
  });

export const marcarVisto = (serie: SerieRef, numero: number, siguiente?: number) =>
  invoke<void>('marcar_visto', {
    aid: serie.aid,
    slug: serie.slug,
    titulo: serie.titulo,
    numero,
    siguiente: siguiente ?? null,
  });

export const progresoDe = (aid: number, numero: number) => invoke<number | null>('progreso_de', { aid, numero });

export const continuarViendo = (limite: number) => invoke<EntradaContinuar[]>('continuar_viendo', { limite });

export const descartarProgreso = (aid: number) => invoke<void>('descartar_progreso', { aid });

/** Los ajustes viajan como texto: leerlos con `lib/ajustes.ts`, que valida y cae al valor por defecto. */
export const leerAjuste = (clave: string) => invoke<string | null>('leer_ajuste', { clave });

export const guardarAjuste = (clave: string, valor: string) => invoke<void>('guardar_ajuste', { clave, valor });
