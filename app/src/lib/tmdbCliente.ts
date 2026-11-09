import { fetch as fetchDeTauri } from '@tauri-apps/plugin-http';
import { crearClienteTmdb } from '../../../core/src/index.ts';
import { leerClaveTmdb } from './datos.ts';

let claveEnMemoria: string | null | undefined;

/** Tras guardar o borrar la clave, el siguiente uso vuelve a leer el almacén de credenciales. */
export function olvidarClaveTmdb() {
  claveEnMemoria = undefined;
}

/** La clave se lee del almacén una vez y se guarda en memoria; nunca se imprime. */
async function clave(): Promise<string | null> {
  if (claveEnMemoria === undefined) claveEnMemoria = await leerClaveTmdb();
  return claveEnMemoria;
}

export const clienteTmdb = crearClienteTmdb({ fetch: fetchDeTauri as typeof fetch, clave });

/** ¿Hay una clave guardada? No hace ninguna petición. */
export async function hayClaveTmdb(): Promise<boolean> {
  return (await clave()) !== null;
}
