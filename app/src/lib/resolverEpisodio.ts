import type { Idioma, Playable } from '../../../core/src/index.ts';
import { ajustes, asegurarAjustes, guardarAjusteSilencioso } from './ajustes.svelte.ts';
import { fuentes } from './fuentes.ts';
import { servidorGuardable, servidorPreferido } from './reproduccion.ts';

/**
 * Resuelve un episodio a algo reproducible. Con «Recordar el último servidor» activo prueba antes el de la
 * última vez. `excluidos` son los servidores que ya resolvieron en esta pantalla pero no entregaron el vídeo.
 */
export async function resolverEpisodio(
  slug: string,
  numero: number,
  idioma: Idioma,
  excluidos: readonly string[] = [],
): Promise<Playable> {
  await asegurarAjustes();
  return fuentes.resolver(
    slug,
    numero,
    idioma,
    servidorPreferido(ajustes.recordarServidor, ajustes.servidorUltimo),
    excluidos,
  );
}

/**
 * Anota el servidor como el de la última vez. Se llama cuando el vídeo ya está sonando, no al resolver: un
 * servidor que resuelve pero luego no entrega el vídeo no debe quedar como preferido.
 */
export function recordarServidor(playable: Playable): void {
  if (!ajustes.recordarServidor || !servidorGuardable(playable.servidor)) return;
  if (playable.servidor === ajustes.servidorUltimo) return;
  ajustes.servidorUltimo = playable.servidor;
  guardarAjusteSilencioso('servidor_ultimo', playable.servidor);
}
