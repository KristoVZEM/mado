import { getVersion } from '@tauri-apps/api/app';
import { fetch as fetchDeTauri } from '@tauri-apps/plugin-http';
import { crearClienteAniskip, type ClienteAniskip } from '../../../core/src/index.ts';
import { introGuardar, introLeer } from './datos.ts';
import type { TramoIntro } from './intro.ts';
import { buscarIntro } from './introServicio.ts';

let cliente: ClienteAniskip | undefined;

async function clienteAniskip(): Promise<ClienteAniskip> {
  cliente ??= crearClienteAniskip({
    // Las peticiones salen por Rust (plugin-http), solo al host permitido en `capabilities/default.json`.
    fetch: fetchDeTauri as typeof fetch,
    version: await getVersion().catch(() => '0'),
  });
  return cliente;
}

/** El tramo del opening de un episodio con la caché local y AniSkip; nunca lanza. */
export const tramoDeIntro = (p: { malId: number | null | undefined; episodio: number; duracion: number }): Promise<TramoIntro | null> =>
  buscarIntro(
    { leer: introLeer, guardar: introGuardar, pedir: async (q) => (await clienteAniskip()).introDe(q) },
    p,
  );
