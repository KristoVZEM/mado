import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { crearVigilante } from './avisos.ts';
import { alcanceAvisosDe, incluirFavoritasDe, intervaloAvisosDe, intervaloAvisosMs } from './avisosAjustes.ts';
import { avisosCandidatas, avisosGuardar, leerAjuste } from './datos.ts';
import { fuentes } from './fuentes.ts';

/** Los avisos están activos salvo que el ajuste valga 0. */
export const avisosActivos = async () => (await leerAjuste('avisos_activos').catch(() => null)) !== '0';

/** Pide permiso si hace falta. `false` si el sistema bloquea las notificaciones. */
async function permisoDeAvisos(): Promise<boolean> {
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === 'granted';
}

export async function enviarAviso(texto: { titulo: string; cuerpo: string }): Promise<void> {
  if (!(await permisoDeAvisos())) throw new Error('permiso de notificaciones denegado');
  sendNotification({ title: texto.titulo, body: texto.cuerpo });
}

const vigilante = crearVigilante({
  activo: avisosActivos,
  candidatas: async () =>
    avisosCandidatas(incluirFavoritasDe(alcanceAvisosDe(await leerAjuste('avisos_alcance').catch(() => null)))),
  disponibles: async (slug) => (await fuentes.episodios(slug)).episodes.map((e) => e.number),
  guardar: avisosGuardar,
  notificar: enviarAviso,
  pausa: (ms) => new Promise((r) => setTimeout(r, ms)),
});

/**
 * Primera comprobación ya y luego a la frecuencia elegida en Ajustes mientras la app esté abierta. El intervalo
 * se lee antes de cada espera, así que un cambio vale desde la siguiente.
 */
export function iniciarAvisos(): void {
  const siguiente = async () => {
    const intervalo = intervaloAvisosDe(await leerAjuste('avisos_intervalo').catch(() => null));
    setTimeout(() => void comprobarYEsperar(), intervaloAvisosMs(intervalo));
  };
  const comprobarYEsperar = async () => {
    await vigilante.comprobar();
    await siguiente();
  };
  void comprobarYEsperar();
}
