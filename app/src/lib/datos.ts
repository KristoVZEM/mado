import { invoke } from '@tauri-apps/api/core';
import type { Bajada, LocalSync } from '../../../core/src/index.ts';

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

export const marcarVisto = (serie: SerieRef, numero: number, siguiente?: number, anteriores: number[] = []) =>
  invoke<void>('marcar_visto', {
    aid: serie.aid,
    slug: serie.slug,
    titulo: serie.titulo,
    numero,
    siguiente: siguiente ?? null,
    anteriores,
  });

/** Números de episodio vistos de una serie, de menor a mayor. */
export const episodiosVistos = (aid: number) => invoke<number[]>('episodios_vistos', { aid });

export const progresoDe = (aid: number, numero: number) => invoke<number | null>('progreso_de', { aid, numero });

export const continuarViendo = (limite: number) => invoke<EntradaContinuar[]>('continuar_viendo', { limite });

export const descartarProgreso = (aid: number) => invoke<void>('descartar_progreso', { aid });

/** Los ajustes viajan como texto: leerlos con `lib/ajustes.ts`, que valida y cae al valor por defecto. */
export const leerAjuste = (clave: string) => invoke<string | null>('leer_ajuste', { clave });

export const guardarAjuste = (clave: string, valor: string) => invoke<void>('guardar_ajuste', { clave, valor });

/** Estado de seguimiento: 1 Viendo, 2 Considerando, 3 Completado, 4 Dropeado, 5 Pausado; `null` si no se sigue. */
export const estadoSerie = (aid: number) => invoke<number | null>('estado_serie', { aid });

/** `estado` 0 deja de seguir la serie; 1–5 la sigue con ese estado. */
export const fijarEstado = (serie: SerieRef, estado: number) =>
  invoke<void>('fijar_estado', { aid: serie.aid, slug: serie.slug, titulo: serie.titulo, estado });

export const esFavorito = (aid: number) => invoke<boolean>('es_favorito', { aid });

/** Marca o desmarca la serie como favorita; devuelve si queda marcada. */
export const alternarFavorito = (serie: SerieRef) =>
  invoke<boolean>('alternar_favorito', { aid: serie.aid, slug: serie.slug, titulo: serie.titulo });

/** Una fila de la biblioteca tal como la devuelve Rust (camelCase). */
export interface EntradaBiblioteca {
  aid: number;
  slug: string;
  titulo: string;
  /** 1 Viendo … 5 Pausado; `null` si no se sigue (solo puede pasar en favoritos). */
  estado: number | null;
  /** Episodio más alto del historial; `null` si no hay ninguno visto. */
  ultimoEpisodio: number | null;
}

export interface Biblioteca {
  siguiendo: EntradaBiblioteca[];
  favoritos: EntradaBiblioteca[];
}

/** Sin orden: la interfaz ordena (`lib/biblioteca.ts`). */
export const listarBiblioteca = () => invoke<Biblioteca>('listar_biblioteca');

/** Vista previa del `history` de la copia; ver `copia/historial.rs`. */
export interface ResumenHistorial {
  total: number;
  series: number;
  nuevos: number;
  existentes: number;
  invalidos: number;
  /** Episodios vistos que hay ahora en la base (los que borraría "reemplazar"). */
  actuales: number;
}

/** Vista previa de `following` o `favs`: series por `aid`. */
export interface ResumenLista {
  total: number;
  nuevos: number;
  existentes: number;
  invalidos: number;
  /** Filas que hay ahora en la tabla (las que borraría "reemplazar"). */
  actuales: number;
}

/** Vista previa de la carpeta: `null` en los archivos que no están (sus nombres van en `ausentes`). */
export interface ResumenCopia {
  historial: ResumenHistorial | null;
  siguiendo: ResumenLista | null;
  favoritos: ResumenLista | null;
  ausentes: string[];
}

export interface ResultadoArchivo {
  nuevos: number;
  actualizados: number;
  invalidos: number;
}

export interface ResultadoCopia {
  historial: ResultadoArchivo | null;
  siguiendo: ResultadoArchivo | null;
  favoritos: ResultadoArchivo | null;
  /** Ruta de la copia previa de la base (solo al reemplazar). */
  copia: string | null;
}

export type ModoImportacion = 'mezclar' | 'reemplazar';

/** `carpeta` es la que devuelve el diálogo nativo; Rust lee solo `history`, `following` y `favs`. */
export const previsualizarCopia = (carpeta: string) => invoke<ResumenCopia>('previsualizar_copia', { carpeta });

export const importarCopia = (carpeta: string, modo: ModoImportacion) =>
  invoke<ResultadoCopia>('importar_copia', { carpeta, modo });

/** Un episodio visto tal como lo devuelve Rust (camelCase); `vistoEn` en milisegundos. */
export interface EntradaHistorial {
  aid: number;
  slug: string;
  titulo: string;
  numero: number;
  vistoEn: number;
}

/** Del más reciente al más antiguo; páginas con `limite` (Rust lo acota a 1–100) y `desplazamiento`. */
export const listarHistorial = (limite: number, desplazamiento: number) =>
  invoke<EntradaHistorial[]>('listar_historial', { limite, desplazamiento });

export interface RelacionAnilist {
  anilistId: number;
  tipo: string;
  titulo: string;
}

/** Una obra de AniList tal como la guarda y devuelve Rust. `actualizado` en ms (lo pone Rust). */
export interface MediaAnilist {
  anilistId: number;
  malId: number | null;
  tituloRomaji: string;
  tituloIngles: string | null;
  tituloNativo: string | null;
  sinopsis: string | null;
  generos: string[];
  formato: string | null;
  estudio: string | null;
  puntuacion: number | null;
  episodios: number | null;
  estado: string | null;
  portada: string | null;
  banner: string | null;
  /** Número y hora (segundos) del próximo episodio; `null` si no se emite ahora. */
  siguienteEp: number | null;
  siguienteEn: number | null;
  relaciones: RelacionAnilist[];
  sinonimos: string[];
  anio: number | null;
  actualizado?: number;
}

export interface Vinculo {
  aid: number;
  anilistId: number | null;
  confianza: number;
  origen: 'auto' | 'manual' | 'ninguno';
  actualizado: number;
}

export interface VinculoConMedia {
  vinculo: Vinculo;
  media: MediaAnilist | null;
}

export interface PendienteEmparejar {
  aid: number;
  slug: string;
  titulo: string;
  /** 0 = la sigues, 1 = favorita, 2 = el resto. */
  prioridad: number;
}

export interface ItemEmision {
  anilistId: number;
  episodio: number;
  /** Segundos desde 1970. */
  emiteEn: number;
}

export interface EntradaEmision {
  anilistId: number;
  episodio: number;
  emiteEn: number;
  tituloRomaji: string;
  tituloIngles: string | null;
  portada: string | null;
  banner: string | null;
  formato: string | null;
  sinonimos: string[];
  aid: number | null;
  slug: string | null;
  tituloSerie: string | null;
  estado: number | null;
}

export interface ResumenSerie {
  aid: number;
  anilistId: number;
  confianza: number;
  origen: 'auto' | 'manual';
  banner: string | null;
  portada: string | null;
  siguienteEp: number | null;
  siguienteEn: number | null;
  episodios: number | null;
  estado: string | null;
}

export const guardarMedia = (media: MediaAnilist) => invoke<void>('guardar_media', { media });
export const leerMedia = (anilistId: number) => invoke<MediaAnilist | null>('leer_media', { anilistId });

/** `false` si ya había un vínculo manual y el nuevo no lo es (no se pisa). */
export const fijarVinculo = (
  serie: SerieRef,
  anilistId: number | null,
  confianza: number,
  origen: Vinculo['origen'],
) =>
  invoke<boolean>('fijar_vinculo', {
    aid: serie.aid,
    slug: serie.slug,
    titulo: serie.titulo,
    anilistId,
    confianza,
    origen,
  });

export const vinculoConMedia = (aid: number) => invoke<VinculoConMedia | null>('vinculo_con_media', { aid });
export const pendientesEmparejar = (limite: number) => invoke<PendienteEmparejar[]>('pendientes_emparejar', { limite });

/** Sustituye la agenda de `[desde, hasta)` (segundos) y guarda las obras que la acompañan. */
export const guardarEmision = (desde: number, hasta: number, medias: MediaAnilist[], items: ItemEmision[]) =>
  invoke<void>('guardar_emision', { desde, hasta, medias, items });

export const emisionEntre = (desde: number, hasta: number) => invoke<EntradaEmision[]>('emision_entre', { desde, hasta });
export const resumenesVinculados = () => invoke<ResumenSerie[]>('resumenes_vinculados');

/** Cuenta de AniList conectada. `ultimaSync` en ms; `null` = aún no hubo (la primera pide vista previa). */
export interface Cuenta {
  usuarioId: number;
  nombre: string;
  ultimaSync: number | null;
}

/** Series con vínculo firme y lo que hace falta para sincronizarlas; con `aid`, solo esa. */
export const seriesParaSync = (aid?: number) => invoke<LocalSync[]>('series_para_sync', { aid: aid ?? null });
export const aplicarBajadas = (bajadas: Bajada[]) => invoke<number>('aplicar_bajadas', { bajadas });
export const guardarCuenta = (usuarioId: number, nombre: string) => invoke<void>('guardar_cuenta', { usuarioId, nombre });
export const leerCuenta = () => invoke<Cuenta | null>('leer_cuenta');
export const borrarCuenta = () => invoke<void>('borrar_cuenta');
export const marcarSincronizada = () => invoke<void>('marcar_sincronizada');

/** El token vive en el Administrador de credenciales de Windows; la interfaz solo lo pide al sincronizar. */
export const guardarTokenAnilist = (token: string) => invoke<void>('guardar_token_anilist', { token });
export const leerTokenAnilist = () => invoke<string | null>('leer_token_anilist');
export const borrarTokenAnilist = () => invoke<void>('borrar_token_anilist');
