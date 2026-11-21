import { validarIntro, type TramoIntro } from './validar.ts';

export const URL_ANISKIP = 'https://api.aniskip.com/v2/skip-times';
/** Una respuesta real pesa unos cientos de bytes; más de 16 KB no es una respuesta de AniSkip. */
export const MAX_CUERPO_BYTES = 16 * 1024;
export const ESPERA_ANISKIP_MS = 5000;

/** `si`: hay un opening plausible; `no`: no lo hay (se puede guardar); `error`: no se sabe (no se guarda). */
export type IntroDe = ({ estado: 'si' } & TramoIntro) | { estado: 'no' } | { estado: 'error' };

export interface OpcionesAniskip {
  /** En la app, el `fetch` de plugin-http; en pruebas, uno falso. */
  fetch?: typeof fetch;
  /** Versión de Mado, para el user-agent genérico `Mado/<versión>`. */
  version: string;
  esperaMs?: number;
}

export interface ClienteAniskip {
  introDe(p: { malId: number; episodio: number; duracion: number }): Promise<IntroDe>;
}

/** Lee el cuerpo sin pasar de `max` bytes. `null` si lo supera (la declaración de tamaño no se fía). */
async function leerAcotado(res: Response, max: number): Promise<string | null> {
  const declarado = Number(res.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!res.body) {
    const t = await res.text();
    return t.length > max ? null : t;
  }
  const lector = res.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      return null;
    }
    trozos.push(value);
  }
  return new Blob(trozos as BlobPart[]).text();
}

export function crearClienteAniskip(op: OpcionesAniskip): ClienteAniskip {
  const hacerFetch = op.fetch ?? fetch;
  const esperaMs = op.esperaMs ?? ESPERA_ANISKIP_MS;
  return {
    async introDe({ malId, episodio, duracion }) {
      if (!Number.isInteger(malId) || malId < 1) return { estado: 'error' };
      if (!Number.isInteger(episodio) || episodio < 0) return { estado: 'error' };
      if (!Number.isFinite(duracion) || duracion <= 0) return { estado: 'error' };
      // Solo GET: nada de enviar ni votar tiempos. Sin cookies ni referer; el único dato propio es el user-agent.
      const url = `${URL_ANISKIP}/${malId}/${episodio}?types=op&episodeLength=${Math.round(duracion * 10) / 10}`;
      try {
        const res = await hacerFetch(url, {
          headers: { 'user-agent': `Mado/${op.version}` },
          credentials: 'omit',
          signal: AbortSignal.timeout(esperaMs),
        });
        if (res.status === 404) return { estado: 'no' };
        if (!res.ok) return { estado: 'error' };
        const texto = await leerAcotado(res, MAX_CUERPO_BYTES);
        if (texto === null) return { estado: 'error' };
        const cuerpo = JSON.parse(texto);
        if (cuerpo?.found === false) return { estado: 'no' };
        const tramo = validarIntro(cuerpo, duracion);
        return tramo ? { estado: 'si', ...tramo } : { estado: 'no' };
      } catch {
        return { estado: 'error' };
      }
    },
  };
}
