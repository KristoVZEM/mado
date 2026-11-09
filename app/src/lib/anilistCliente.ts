import { fetch as fetchDeTauri } from '@tauri-apps/plugin-http';
import { crearClienteAnilist, crearLimitador } from '../../../core/src/index.ts';
import { leerTokenAnilist } from './datos.ts';

/** Todas las peticiones a AniList comparten este limitador de 20 por minuto (el tope real es 30). */
export const limitadorAnilist = crearLimitador(20);

/** Peticiones públicas (emparejador, agenda): sin cuenta. */
export const clienteAnilist = crearClienteAnilist({
  fetch: fetchDeTauri as typeof fetch,
  limitador: limitadorAnilist,
});

let tokenEnMemoria: string | null | undefined;

/** Tras conectar o desconectar, el siguiente uso vuelve a leer el almacén de credenciales. */
export function olvidarTokenEnMemoria() {
  tokenEnMemoria = undefined;
}

/** Peticiones de la cuenta: llevan el token del almacén (se lee una vez y se guarda en memoria). */
export const clienteCuenta = crearClienteAnilist({
  fetch: fetchDeTauri as typeof fetch,
  limitador: limitadorAnilist,
  token: async () => {
    if (tokenEnMemoria === undefined) tokenEnMemoria = await leerTokenAnilist();
    return tokenEnMemoria;
  },
});
