import {
  command,
  init,
  observeProperties,
  setProperty,
  type MpvObservableProperty,
} from 'tauri-plugin-libmpv-api';
import type { Playable } from '../../../core/src/index.ts';
import { cabecerasMpv } from './cabeceras.ts';
import { crearCola } from './cola.ts';

const OBSERVADAS = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['eof-reached', 'flag', 'none'],
] as const satisfies MpvObservableProperty[];

/** Estado reactivo del reproductor, alimentado por los eventos de mpv. */
export const reproductor = $state({
  pausa: false,
  posicion: 0,
  duracion: 0,
  terminado: false,
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
        },
        observedProperties: OBSERVADAS,
      });
      mpvCreado = true;
    }
    await observeProperties(OBSERVADAS, ({ name, data }) => {
      if (name === 'pause') reproductor.pausa = Boolean(data);
      else if (name === 'duration') reproductor.duracion = Number(data ?? 0);
      else if (name === 'time-pos' && data != null) reproductor.posicion = Number(data);
      else if (name === 'eof-reached') reproductor.terminado = Boolean(data);
    });
  })().catch((e) => {
    iniciado = null; // permite reintentar si falló
    throw e;
  });
  return iniciado;
}

/** Carga un Playable y empieza a reproducir. Se serializa con `detener` para que no se crucen. */
export function cargar(p: Playable): Promise<void> {
  return enSerie(() => cargarAhora(p));
}

/** Cuerpo de `cargar` sin serializar; solo lo llama `cargar`. */
async function cargarAhora(p: Playable): Promise<void> {
  await iniciarMpv();
  reproductor.terminado = false;
  reproductor.posicion = 0;
  reproductor.duracion = 0;
  await setProperty('user-agent', p.userAgent);
  await setProperty('http-header-fields', cabecerasMpv(p.headers));
  await command('loadfile', [p.url]);
  await setProperty('pause', false);
}

export function alternarPausa(): Promise<void> {
  return setProperty('pause', !reproductor.pausa);
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
