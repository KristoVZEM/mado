import { invoke } from '@tauri-apps/api/core';
import { crearCola } from './cola.ts';
import type { ProgresoEp } from './episodiosFicha.ts';
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

/**
 * Las escrituras de progreso van en serie y en el orden en que se piden: así un guardado tardío no puede
 * llegar después de `marcarVisto` y volver a crear el progreso de un episodio que ya se marcó como visto.
 */
const enSerie = crearCola();

export const guardarProgreso = (serie: SerieRef, numero: number, posicionS: number, duracionS: number) =>
  enSerie(() =>
    invoke<void>('guardar_progreso', {
      aid: serie.aid,
      slug: serie.slug,
      titulo: serie.titulo,
      numero,
      posicionS,
      duracionS,
    }),
  );

export const marcarVisto = (serie: SerieRef, numero: number, siguiente?: number, anteriores: number[] = []) =>
  enSerie(() =>
    invoke<void>('marcar_visto', {
      aid: serie.aid,
      slug: serie.slug,
      titulo: serie.titulo,
      numero,
      siguiente: siguiente ?? null,
      anteriores,
    }),
  );

/** Números de episodio vistos de una serie, de menor a mayor. */
export const episodiosVistos = (aid: number) => invoke<number[]>('episodios_vistos', { aid });

export const progresoDe = (aid: number, numero: number) => invoke<number | null>('progreso_de', { aid, numero });

/** Episodios a medias de una serie, del más reciente al más antiguo. */
export const progresoDeSerie = (aid: number) => invoke<ProgresoEp[]>('progreso_de_serie', { aid });

export const continuarViendo = (limite: number) => invoke<EntradaContinuar[]>('continuar_viendo', { limite });

export const descartarProgreso = (aid: number) => enSerie(() => invoke<void>('descartar_progreso', { aid }));

/** Quita un episodio de los vistos. */
export const desmarcarVisto = (aid: number, numero: number) =>
  enSerie(() => invoke<void>('desmarcar_visto', { aid, numero }));

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
  portada: string | null;
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
  /** Duración típica de un episodio, en minutos. */
  duracion: number | null;
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
/** Hace pendientes de inmediato todos los vínculos `ninguno`; devuelve cuántos son. */
export const reintentarNingunos = () => invoke<number>('reintentar_ningunos');

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

/** Un vínculo `auto` con el título de la serie y su obra en caché; para repasarlo con las reglas de hoy. */
export interface VinculoAuto {
  aid: number;
  slug: string;
  titulo: string;
  confianza: number;
  media: MediaAnilist;
}

export const vinculosAuto = () => invoke<VinculoAuto[]>('vinculos_auto');

/** Serie en Viendo con vínculo firme y obra en emisión: hay que mirar si salió un episodio nuevo. */
export interface CandidataAviso {
  aid: number;
  slug: string;
  titulo: string;
  /** Último episodio ya avisado; `null` si nunca se vigiló. */
  ultimoAvisado: number | null;
  ultimoVisto: number;
}
export const avisosCandidatas = (incluirFavoritas: boolean) =>
  invoke<CandidataAviso[]>('avisos_candidatas', { incluirFavoritas });
/** Exporta la base a `ruta` (absoluta, terminada en `.db`). */
export const exportarCopia = (ruta: string) => invoke<void>('exportar_copia', { ruta });
/** Crea el respaldo automático del día `etiqueta` (`AAAA-MM-DD`) y devuelve su ruta. */
export const crearRespaldo = (etiqueta: string) => invoke<string>('crear_respaldo', { etiqueta });
/** Carpeta de las copias automáticas: la elegida por el usuario o la de por defecto. */
export const carpetaRespaldos = () => invoke<string>('carpeta_respaldos');
/** Sustituye todos los datos por los de la copia `ruta`; antes guarda los actuales. Devuelve la ruta de esa copia previa. */
export const restaurarCopia = (ruta: string) => invoke<string>('restaurar_copia', { ruta });
/** Borra la caché de logos y fondos de TMDB; devuelve cuántas obras había. */
export const limpiarCacheTmdb = () => invoke<number>('limpiar_cache_tmdb');

export const avisosGuardar = (items: { aid: number; ultimo: number }[]) => invoke<void>('avisos_guardar', { items });

/** Lo guardado de TMDB para una obra: rutas de fondo y logo. `tmdbId` es `null` si se buscó y no se encontró. */
export interface FilaTmdb {
  anilistId: number;
  tmdbId: number | null;
  tipo: 'tv' | 'movie' | null;
  fondo: string | null;
  logo: string | null;
  consultadoEn: number;
}

export const tmdbLeer = (anilistId: number) => invoke<FilaTmdb | null>('tmdb_leer', { anilistId });
export const tmdbGuardar = (fila: FilaTmdb) => invoke<void>('tmdb_guardar', { fila });
/** Lo guardado del intro de un episodio. `inicio` y `fin` (en segundos) son `null` si `estado` es `no`. */
export interface FilaIntro {
  malId: number;
  episodio: number;
  /** Duración del vídeo redondeada al segundo: los tiempos dependen del corte. */
  duracionS: number;
  estado: 'si' | 'no';
  inicio: number | null;
  fin: number | null;
}

export const introLeer = (malId: number, episodio: number, duracionS: number) =>
  invoke<FilaIntro | null>('intro_leer', { malId, episodio, duracionS });
export const introGuardar = (fila: FilaIntro) => invoke<void>('intro_guardar', { fila });
/** La última lista de episodios guardada de una serie: la `Ficha` como JSON y cuándo se pidió (milisegundos). */
export interface FilaEpisodios {
  slug: string;
  datos: string;
  consultadoEn: number;
}

export const episodiosLeer = (slug: string) => invoke<FilaEpisodios | null>('episodios_leer', { slug });
export const episodiosGuardar = (slug: string, datos: string) => invoke<void>('episodios_guardar', { slug, datosJson: datos });
export const guardarClaveTmdb = (clave: string) => invoke<void>('guardar_clave_tmdb', { clave });
export const leerClaveTmdb = () => invoke<string | null>('leer_clave_tmdb');
export const borrarClaveTmdb = () => invoke<void>('borrar_clave_tmdb');
