import { FuenteCambio, SinRed } from './errors.ts';
import type { Http } from './http.ts';
import type { ResolverServidor } from './types.ts';
import { desofuscarVoe, extraerOfuscado, extraerRedireccion } from './voe.ts';

const EMBED_VOE = /^https:\/\/voe\.sx\/e\/[A-Za-z0-9]+(?=[/?#]|$)/;

async function leerTexto(http: Http, url: string, contexto: string): Promise<string> {
  const res = await http.get(url);
  if (!res.ok) throw new FuenteCambio(`${contexto}: HTTP ${res.status}`);
  try {
    return await res.text();
  } catch (e) {
    throw new SinRed(`${contexto}: se cortó la lectura de la respuesta`, { cause: e });
  }
}

function leerSource(datos: unknown): string {
  const source = (datos as { source?: unknown } | null)?.source;
  if (typeof source !== 'string') throw new FuenteCambio('voe: los datos no traen "source"');
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new FuenteCambio('voe: "source" no es una URL');
  }
  if (url.protocol !== 'https:') throw new FuenteCambio('voe: "source" no es https');
  // Se devuelve tal cual llegó: la URL lleva un token firmado y no conviene reescribirla.
  return source;
}

/** Altura máxima declarada en el master.m3u8. Es informativa: cualquier fallo deja la calidad sin definir. */
async function alturaMaxima(http: Http, master: string): Promise<number | undefined> {
  try {
    const res = await http.get(master);
    if (!res.ok) return undefined;
    const texto = await res.text();
    const alturas = [...texto.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => Number(m[1]));
    return alturas.length > 0 ? Math.max(...alturas) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Voe (720p, último recurso de la cadena). `voe.sx/e/<id>` redirige por JavaScript a un dominio
 * que rota; esa segunda página trae el stream en un bloque JSON ofuscado. El token del `source`
 * dura unas 4 h y va atado a la IP, así que el Playable no debe guardarse.
 */
export function crearResolverVoe(http: Http): ResolverServidor {
  return async (embed, userAgent) => {
    if (!EMBED_VOE.test(embed.url)) return null;
    const redireccion = await leerTexto(http, embed.url, 'voe: página de redirección');
    const destino = extraerRedireccion(redireccion);
    const pagina = await leerTexto(http, destino, 'voe: página del reproductor');
    const source = leerSource(desofuscarVoe(extraerOfuscado(pagina)));
    const calidad = await alturaMaxima(http, source);
    return { url: source, headers: {}, userAgent, ...(calidad !== undefined ? { calidad } : {}) };
  };
}
