import { fetch as fetchDeTauri } from '@tauri-apps/plugin-http';
import { crearClienteAnilist, crearLimitador } from '../../../core/src/index.ts';

/** Todas las peticiones a AniList salen por aquí: un único limitador de 20 por minuto (el tope real es 30). */
export const clienteAnilist = crearClienteAnilist({
  fetch: fetchDeTauri as typeof fetch,
  limitador: crearLimitador(20),
});
