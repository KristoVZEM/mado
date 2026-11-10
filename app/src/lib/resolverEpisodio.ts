import type { Idioma, Playable } from '../../../core/src/index.ts';
import { ajustes, asegurarAjustes, guardarAjusteSilencioso } from './ajustes.svelte.ts';
import { fuentes } from './fuentes.ts';
import { servidorGuardable, servidorPreferido } from './reproduccion.ts';

/**
 * Resuelve un episodio a algo reproducible. Con «Recordar el último servidor» activo prueba antes el de la
 * última vez y, si el que gana es otro, lo anota para la próxima.
 */
export async function resolverEpisodio(slug: string, numero: number, idioma: Idioma): Promise<Playable> {
  await asegurarAjustes();
  const playable = await fuentes.resolver(slug, numero, idioma, servidorPreferido(ajustes.recordarServidor, ajustes.servidorUltimo));
  if (ajustes.recordarServidor && servidorGuardable(playable.servidor) && playable.servidor !== ajustes.servidorUltimo) {
    ajustes.servidorUltimo = playable.servidor;
    guardarAjusteSilencioso('servidor_ultimo', playable.servidor);
  }
  return playable;
}
