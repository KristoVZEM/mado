import { Desafio, FuenteCambio, SinRed } from './errors.ts';

export const BASE = 'https://animeav1.com';
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export interface Http {
  userAgent: string;
  get(url: string, init?: RequestInit): Promise<Response>;
}

export interface HttpOptions {
  /** En producción, el `fetch` de plugin-http; en tests, uno falso. */
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Pausa mínima entre el inicio de dos peticiones. */
  gapMs?: number;
  timeoutMs?: number;
  retries?: number;
  /** Espera antes del reintento n: backoffMs * 2^n. */
  backoffMs?: number;
}

export function assertNoChallenge(res: Response): void {
  const mitigated = res.headers.get('cf-mitigated') === 'challenge';
  // Un 403/503 solo cuenta como desafío si lo sirve Cloudflare; los demás son errores normales.
  const cloudflare = /cloudflare/i.test(res.headers.get('server') ?? '');
  if (mitigated || ((res.status === 503 || res.status === 403) && cloudflare)) {
    throw new Desafio(`Cloudflare pide un desafío (HTTP ${res.status}) en ${res.url || 'la fuente'}`);
  }
}

/** Lee el JSON de una respuesta de la fuente; si no es 2xx o no es JSON, la fuente cambió. */
export async function leerJson(res: Response, contexto: string): Promise<any> {
  if (!res.ok) throw new FuenteCambio(`${contexto}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new FuenteCambio(`${contexto}: la respuesta no es JSON`);
  }
}

export function createHttp(opts: HttpOptions = {}): Http {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const gapMs = opts.gapMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 500;

  // Cola de turnos: aunque lleguen peticiones a la vez, cada una espera su turno
  // y arranca al menos gapMs después de la anterior.
  let ultimo = -Infinity;
  let cola: Promise<void> = Promise.resolve();
  function turno(): Promise<void> {
    const mio = cola.then(async () => {
      const espera = ultimo + gapMs - now();
      if (espera > 0) await sleep(espera);
      ultimo = now();
    });
    cola = mio.catch(() => {});
    return mio;
  }

  async function get(url: string, init: RequestInit = {}): Promise<Response> {
    for (let intento = 0; ; intento++) {
      await turno();
      try {
        const res = await doFetch(url, {
          ...init,
          headers: { 'user-agent': UA, ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(timeoutMs),
        });
        assertNoChallenge(res);
        if (res.status >= 500) throw new SinRed(`HTTP ${res.status} en ${url}`);
        return res;
      } catch (e) {
        if (e instanceof Desafio) throw e;
        const err =
          e instanceof SinRed
            ? e
            : new SinRed(`sin respuesta de ${url}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        if (intento >= retries) throw err;
        await sleep(backoffMs * 2 ** intento);
      }
    }
  }

  return { userAgent: UA, get };
}
