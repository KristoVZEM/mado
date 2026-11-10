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
  /** Espera máxima de una petición. Con una función se consulta en cada petición (para poder cambiarla en marcha). */
  timeoutMs?: number | (() => number);
  retries?: number;
  /** Espera antes del reintento n: backoffMs * 2^n. */
  backoffMs?: number;
}

/** Quita el query y el fragmento: la URL de Voe lleva un token en el query que no debe llegar a los mensajes. */
function sinQuery(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return 'la URL';
  }
}

export function assertNoChallenge(res: Response): void {
  const mitigated = res.headers.get('cf-mitigated') === 'challenge';
  // Cloudflare pone `server: cloudflare` en toda respuesta que pasa por su proxy, así que un
  // 503 con esa cabecera no distingue un desafío de una caída del origen. Es desafío si trae
  // `cf-mitigated: challenge` o si es un 403 servido por Cloudflare; un 503 lo trata `get` como 5xx.
  const cloudflare = /cloudflare/i.test(res.headers.get('server') ?? '');
  if (mitigated || (res.status === 403 && cloudflare)) {
    throw new Desafio(`Cloudflare pide un desafío (HTTP ${res.status}) en ${res.url ? sinQuery(res.url) : 'la fuente'}`);
  }
}

/** Lee el JSON de una respuesta de la fuente; si no es 2xx o no es JSON, la fuente cambió. */
export async function leerJson(res: Response, contexto: string): Promise<any> {
  if (!res.ok) throw new FuenteCambio(`${contexto}: HTTP ${res.status}`);
  let texto: string;
  try {
    texto = await res.text();
  } catch (e) {
    throw new SinRed(`${contexto}: se cortó la lectura de la respuesta`, { cause: e });
  }
  try {
    return JSON.parse(texto);
  } catch {
    throw new FuenteCambio(`${contexto}: la respuesta no es JSON`);
  }
}

export function createHttp(opts: HttpOptions = {}): Http {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const gapMs = opts.gapMs ?? 1500;
  const timeoutMs = () => (typeof opts.timeoutMs === 'function' ? opts.timeoutMs() : (opts.timeoutMs ?? 15_000));
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
          signal: AbortSignal.timeout(timeoutMs()),
        });
        assertNoChallenge(res);
        if (res.status >= 500) {
          await res.body?.cancel().catch(() => {});
          throw new SinRed(`HTTP ${res.status} en ${sinQuery(url)}`);
        }
        return res;
      } catch (e) {
        if (e instanceof Desafio) throw e;
        const err =
          e instanceof SinRed
            ? e
            : new SinRed(`sin respuesta de ${sinQuery(url)}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        if (intento >= retries) throw err;
        await sleep(backoffMs * 2 ** intento);
      }
    }
  }

  return { userAgent: UA, get };
}
