import { check, type Update } from '@tauri-apps/plugin-updater';
import { claseDeError, debeComprobar, mensajeDeError, porcentaje } from './actualizacion.ts';
import { ajustes, asegurarAjustes } from './ajustes.svelte.ts';
import { numeroDeAjuste } from './ajustes.ts';
import { ejecutarAlCerrar } from './cierre.ts';
import { guardarAjuste, leerAjuste } from './datos.ts';
import { nav } from './navegacion.svelte.ts';

/**
 * - `inactivo`: nada que ofrecer.
 * - `comprobando`: preguntando si hay versión nueva.
 * - `disponible`: hay una versión nueva y se espera a que el usuario pulse «Actualizar».
 * - `descargando`: bajando el instalador; `porcentaje` lleva el avance si se conoce el tamaño.
 * - `descargada`: el instalador está bajado pero había un episodio en marcha: se instala al volver a una pantalla normal.
 * - `fallo`: la descarga o la instalación fallaron; `mensaje` lo explica y se puede reintentar.
 */
export type EstadoActualizacion = 'inactivo' | 'comprobando' | 'disponible' | 'descargando' | 'descargada' | 'fallo';

/** Estado de las actualizaciones para el aviso global y para Ajustes. */
export const actualizacion = $state<{
  estado: EstadoActualizacion;
  version: string;
  porcentaje: number | null;
  /** El usuario pulsó «Más tarde»: el aviso se esconde hasta la próxima comprobación que encuentre versión. */
  descartado: boolean;
  /** Resultado de la última comprobación a mano («Estás al día.», un fallo de red…) o del último intento de instalar. */
  mensaje: string;
}>({ estado: 'inactivo', version: '', porcentaje: null, descartado: false, mensaje: '' });

/** La versión nueva que ofreció la última comprobación, y si su instalador ya está descargado. */
let pendiente: Update | null = null;
let descargado = false;

/** Un episodio en marcha: el instalador cierra la app, así que ni se instala ni se avisa en ese momento. */
export const reproduciendoAhora = (): boolean => nav.superior?.tipo === 'reproducir';

function anotarComprobacion(): void {
  guardarAjuste('actualizacion_ultima', String(Date.now())).catch((e) =>
    console.error('no se pudo guardar la hora de la última comprobación de versión', e),
  );
}

/**
 * Pregunta si hay una versión nueva. `manual` es el botón «Buscar ahora»: enseña siempre el resultado. Al abrir la
 * app (`manual: false`) solo se nota si hay versión; un fallo de red no molesta. Los errores se registran por su clase,
 * nunca con su texto, que puede llevar la URL.
 */
export async function buscarActualizacion(manual: boolean): Promise<void> {
  if (actualizacion.estado === 'comprobando' || actualizacion.estado === 'descargando') return;
  const previo = actualizacion.estado;
  actualizacion.estado = 'comprobando';
  actualizacion.mensaje = '';
  try {
    const nueva = await check();
    anotarComprobacion();
    if (nueva) {
      pendiente = nueva;
      descargado = false;
      actualizacion.version = nueva.version;
      actualizacion.porcentaje = null;
      actualizacion.descartado = false;
      actualizacion.estado = 'disponible';
    } else {
      pendiente = null;
      actualizacion.estado = 'inactivo';
      if (manual) actualizacion.mensaje = 'Estás al día.';
    }
  } catch (e) {
    const clase = claseDeError(e);
    // Aún no hay `latest.json` publicado: se trata como «sin novedades» y sí cuenta como comprobación hecha.
    if (clase === 'sin-release') anotarComprobacion();
    // Un fallo no tira abajo una oferta que ya teníamos.
    actualizacion.estado = previo === 'disponible' || previo === 'descargada' ? previo : 'inactivo';
    if (manual) actualizacion.mensaje = mensajeDeError(e);
    if (clase !== 'sin-release') console.warn('comprobación de versión fallida:', clase);
  }
}

/**
 * Botón «Actualizar» (o «Instalar y reiniciar» si ya estaba descargada): descarga con progreso y, si no hay un episodio
 * en marcha, guarda lo pendiente e instala. En Windows el instalador cierra la app. Nunca instala durante una
 * reproducción: si empezó una mientras se descargaba, queda `descargada` a la espera.
 */
export async function instalarActualizacion(reproduciendo: () => boolean = reproduciendoAhora): Promise<void> {
  const nueva = pendiente;
  const puede = actualizacion.estado === 'disponible' || actualizacion.estado === 'descargada' || actualizacion.estado === 'fallo';
  if (!nueva || !puede || reproduciendo()) return;
  actualizacion.mensaje = '';
  try {
    if (!descargado) {
      actualizacion.estado = 'descargando';
      actualizacion.porcentaje = null;
      let total = 0;
      let acumulado = 0;
      await nueva.download((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        else if (e.event === 'Progress') {
          acumulado += e.data.chunkLength;
          actualizacion.porcentaje = porcentaje(total, acumulado);
        }
      });
      descargado = true;
    }
    if (reproduciendo()) {
      actualizacion.estado = 'descargada';
      return;
    }
    // El instalador cierra la app: antes se guarda lo pendiente (progreso, volumen), como al cerrar la ventana.
    await ejecutarAlCerrar();
    await nueva.install();
  } catch (e) {
    actualizacion.estado = 'fallo';
    actualizacion.mensaje = 'No se pudo instalar la versión nueva. Inténtalo de nuevo.';
    console.warn('instalación de la versión fallida:', claseDeError(e));
  }
}

export function aplazarActualizacion(): void {
  actualizacion.descartado = true;
}

/**
 * Comprobación automática: al abrir y, mientras la app sigue abierta, cada vez que se llama (la app la repite cada rato
 * por si el primer intento se aplazó por una reproducción). Respeta el ajuste, el tope de una al día y las reproducciones.
 */
export async function comprobarSiToca(reproduciendo: () => boolean = reproduciendoAhora): Promise<void> {
  await asegurarAjustes();
  const ultimaMs = numeroDeAjuste(await leerAjuste('actualizacion_ultima').catch(() => null), 0, 0, 9e15);
  const toca = debeComprobar({
    ahora: Date.now(),
    ultimaMs,
    reproduciendo: reproduciendo(),
    activado: ajustes.actualizarAlAbrir,
  });
  if (toca) await buscarActualizacion(false);
}
