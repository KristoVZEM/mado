import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { crearVigilante, INTERVALO_AVISOS_MS } from './avisos.ts';
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
  candidatas: avisosCandidatas,
  disponibles: async (slug) => (await fuentes.episodios(slug)).episodes.map((e) => e.number),
  guardar: avisosGuardar,
  notificar: enviarAviso,
  pausa: (ms) => new Promise((r) => setTimeout(r, ms)),
});

/** Primera comprobación ya y luego cada 30 minutos mientras la app esté abierta. */
export function iniciarAvisos(): void {
  void vigilante.comprobar();
  setInterval(() => void vigilante.comprobar(), INTERVALO_AVISOS_MS);
}
