import {
  command,
  init,
  listenEvents,
  observeProperties,
  setProperty,
  type MpvObservableProperty,
} from 'tauri-plugin-libmpv-api';
import type { Playable } from '../../../core/src/index.ts';
import { cabecerasMpv } from './cabeceras.ts';
import { alCerrar } from './cierre.ts';
import { crearRetardo } from './retardo.ts';
import { crearCola } from './cola.ts';
import { argumentosLoadfile } from './idioma.ts';
import { validarUrlDeStream } from './url.ts';
import { VOLUMEN_PASO, limitarVolumen } from './volumen.ts';
import { esFalloDeReproduccion } from './finArchivo.ts';
import { ajustes, asegurarAjustes, guardarAjusteSilencioso } from './ajustes.svelte.ts';

const OBSERVADAS = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['eof-reached', 'flag', 'none'],
  ['volume', 'double'],
  ['mute', 'flag'],
  ['speed', 'double'],
] as const satisfies MpvObservableProperty[];

/** Estado reactivo del reproductor, alimentado por los eventos de mpv. */
export const reproductor = $state({
  pausa: false,
  posicion: 0,
  duracion: 0,
  terminado: false,
  /** mpv avisó de que no pudo cargar o reproducir el vídeo actual (`end-file` con motivo error). */
  falloCarga: false,
  volumen: 100,
  velocidad: 1,
  silencio: false,
});

let iniciado: Promise<void> | null = null;
const enSerie = crearCola();
let mpvCreado = false;

/**
 * Inicializa mpv una sola vez (la primera reproducción) y no se destruye: la ventana es
 * transparente y las pantallas que no son el Reproductor tapan el vídeo con fondo opaco.
 */
function iniciarMpv(): Promise<void> {
  iniciado ??= (async () => {
    if (!mpvCreado) {
      await init({
        initialOptions: {
          vo: 'gpu-next',
          hwdec: 'auto-safe',
          'keep-open': 'yes',
          'force-window': 'yes',
          ytdl: 'no',
        },
        observedProperties: OBSERVADAS,
      });
      mpvCreado = true;
      await asegurarAjustes();
      reproductor.volumen = ajustes.volumen;
      await setProperty('volume', reproductor.volumen);
      await setProperty('speed', ajustes.velocidad);
    }
    await observeProperties(OBSERVADAS, ({ name, data }) => {
      if (name === 'pause') reproductor.pausa = Boolean(data);
      else if (name === 'duration') reproductor.duracion = Number(data ?? 0);
      else if (name === 'time-pos' && data != null) reproductor.posicion = Number(data);
      else if (name === 'eof-reached') reproductor.terminado = Boolean(data);
      else if (name === 'volume' && data != null) reproductor.volumen = Number(data);
      else if (name === 'mute') reproductor.silencio = Boolean(data);
      else if (name === 'speed' && data != null) reproductor.velocidad = Number(data);
    });
    await listenEvents((evento) => {
      if (esFalloDeReproduccion(evento)) reproductor.falloCarga = true;
    });
  })().catch((e) => {
    iniciado = null; // permite reintentar si falló
    throw e;
  });
  return iniciado;
}

/**
 * Carga un Playable y empieza a reproducir, desde `inicio` segundos si se indica. Se serializa con
 * `detener` para que no se crucen.
 */
export function cargar(p: Playable, inicio?: number): Promise<void> {
  return enSerie(() => cargarAhora(p, inicio));
}

/** Cuerpo de `cargar` sin serializar; solo lo llama `cargar`. */
async function cargarAhora(p: Playable, inicio?: number): Promise<void> {
  const url = validarUrlDeStream(p.url);
  await iniciarMpv();
  reproductor.terminado = false;
  reproductor.falloCarga = false;
  reproductor.posicion = inicio ?? 0;
  reproductor.duracion = 0;
  await setProperty('user-agent', p.userAgent);
  await setProperty('http-header-fields', cabecerasMpv(p.headers));
  await command('loadfile', argumentosLoadfile(url, inicio));
  await setProperty('pause', false);
}

export function alternarPausa(): Promise<void> {
  return setProperty('pause', !reproductor.pausa);
}

/** Al arrastrar el control se emiten decenas de valores: solo se guarda el último, 400 ms después. */
const guardarVolumen = crearRetardo<string>((v) => guardarAjusteSilencioso('volumen', v), 400);
alCerrar(() => guardarVolumen.vaciar());

/** Fija el volumen (0-100), lo recuerda para el próximo arranque y quita el silencio si sube. */
export async function fijarVolumen(n: number): Promise<void> {
  const v = limitarVolumen(n);
  ajustes.volumen = v;
  guardarVolumen.llamar(String(v));
  await setProperty('volume', v);
  if (reproductor.silencio && v > 0) await setProperty('mute', false);
}

/** Fija la velocidad de reproducción y la recuerda para los próximos episodios. */
export async function fijarVelocidad(v: number): Promise<void> {
  await setProperty('speed', v);
  ajustes.velocidad = v;
  guardarAjusteSilencioso('velocidad', String(v));
}

/** Sube o baja el volumen un paso; `direccion` es 1 o -1. */
export function cambiarVolumen(direccion: 1 | -1): Promise<void> {
  return fijarVolumen(reproductor.volumen + direccion * VOLUMEN_PASO);
}

export function alternarSilencio(): Promise<void> {
  return setProperty('mute', !reproductor.silencio);
}

/** Salto relativo en segundos (negativo para retroceder). */
export function saltarRelativo(segundos: number): Promise<void> {
  return command('seek', [String(segundos), 'relative']);
}

export function saltarAbsoluto(segundos: number): Promise<void> {
  return command('seek', [String(segundos), 'absolute']);
}

/** Detiene la reproducción y vacía la lista; mpv sigue vivo para el siguiente episodio. */
export function detener(): Promise<void> {
  return enSerie(detenerAhora);
}

/** Cuerpo de `detener` sin serializar; solo lo llama `detener`. */
async function detenerAhora(): Promise<void> {
  if (!iniciado) return;
  await command('stop');
  reproductor.posicion = 0;
  reproductor.duracion = 0;
  reproductor.terminado = false;
}
