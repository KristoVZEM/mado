import type { EntradaBiblioteca, EntradaContinuar, EntradaEmision, EntradaHistorial } from '../lib/datos.ts';
import { responder } from './tauriFalso.ts';

const LISTAS = ['continuar_viendo', 'listar_historial', 'episodios_vistos', 'progreso_de_serie', 'emision_entre',
  'avisos_candidatas', 'pendientes_emparejar', 'series_para_sync', 'resumenes_vinculados', 'vinculos_auto'];
const NULOS = ['estado_datos', 'leer_ajuste', 'leer_cuenta', 'leer_clave_tmdb', 'leer_token_anilist', 'leer_media',
  'tmdb_leer', 'episodios_leer', 'vinculo_con_media', 'estado_serie', 'progreso_de'];
const ESCRITURAS = ['alternar_favorito', 'aplicar_bajadas', 'avisos_guardar', 'bandeja_visible', 'borrar_clave_tmdb',
  'borrar_cuenta', 'borrar_token_anilist', 'crear_respaldo', 'descartar_progreso', 'desmarcar_visto', 'exportar_copia',
  'fijar_estado', 'fijar_vinculo', 'guardar_ajuste', 'guardar_clave_tmdb', 'guardar_cuenta', 'guardar_emision',
  'guardar_media', 'guardar_progreso', 'guardar_token_anilist', 'importar_copia', 'limpiar_cache_tmdb',
  'marcar_sincronizada', 'marcar_visto', 'previsualizar_copia', 'reintentar_ningunos', 'restaurar_copia',
  'tmdb_guardar', 'episodios_guardar', 'abrir_registros', 'resolve_webview'];

/** Una base de datos recién creada: sin series, sin ajustes, sin cuenta. Un comando nuevo no listado falla con su nombre. */
export function backendVacio(): void {
  for (const c of LISTAS) responder(c, []);
  for (const c of NULOS) responder(c, null);
  for (const c of ESCRITURAS) responder(c, null);
  responder('listar_biblioteca', { siguiendo: [], favoritos: [] });
  responder('es_favorito', false);
  responder('carpeta_respaldos', '');
}

export const SERIE_FALSA = { aid: 1, title: 'Serie de prueba', slug: 'serie-de-prueba' };

const ENTRADA: EntradaBiblioteca = { aid: 1, slug: 'serie-de-prueba', titulo: 'Serie de prueba', estado: 1, ultimoEpisodio: 3 };
const HISTORIAL: EntradaHistorial = { aid: 1, slug: 'serie-de-prueba', titulo: 'Serie de prueba', numero: 3, vistoEn: Date.now() };
const CONTINUAR: EntradaContinuar = {
  aid: 1, slug: 'serie-de-prueba', titulo: 'Serie de prueba', numero: 4, posicionS: 600, duracionS: 1400, actualizado: Date.now(),
};
const EMISION: EntradaEmision = {
  anilistId: 100, episodio: 5, emiteEn: Math.floor(Date.now() / 1000) + 3600, tituloRomaji: 'Serie de prueba (romaji)',
  tituloIngles: null, portada: null, banner: null, formato: 'TV', sinonimos: [], aid: 1, slug: 'serie-de-prueba',
  tituloSerie: 'Serie de prueba', estado: 1,
};

/** Una base con una serie seguida, con historial, un episodio a medias y un estreno próximo. */
export function backendConDatos(): void {
  backendVacio();
  responder('listar_biblioteca', { siguiendo: [ENTRADA], favoritos: [] });
  responder('listar_historial', [HISTORIAL]);
  responder('continuar_viendo', [CONTINUAR]);
  responder('emision_entre', [EMISION]);
  responder('episodios_vistos', [1, 2, 3]);
  responder('estado_serie', 1);
}
