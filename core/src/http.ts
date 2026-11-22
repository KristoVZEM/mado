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

/** Quita el query y el fragmento: una URL de vídeo puede llevar un token en el query que no debe llegar a los mensajes. */
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

/** `alta`: lo que el usuario acaba de pedir (abrir una serie, reproducir). `baja`: tareas de fondo que pueden esperar. */
export type Prioridad = 'alta' | 'baja';

/** El cliente principal (prioridad `alta`) y la forma de sacar vistas de otra prioridad que comparten su cola. */
export interface HttpConPrioridad extends Http {
  conPrioridad(prioridad: Prioridad): Http;
}

export function createHttp(opts: HttpOptions = {}): HttpConPrioridad {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const gapMs = opts.gapMs ?? 1500;
  const timeoutMs = () => (typeof opts.timeoutMs === 'function' ? opts.timeoutMs() : (opts.timeoutMs ?? 15_000));
  const retries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 500;

  // Cola de turnos con dos prioridades: aunque lleguen peticiones a la vez, cada una espera su turno y arranca al menos
  // gapMs después de la anterior. El siguiente se elige DESPUÉS de esperar la pausa: una petición `alta` (lo que hace el
  // usuario) que llega mientras se espera por una `baja` (tareas de fondo) pasa por delante, y espera como mucho el resto
  // de la pausa, no toda la cola.
  let ultimo = -Infinity;
  const pendientes: Record<Prioridad, Array<() => void>> = { alta: [], baja: [] };
  let bombeando = false;
  async function bombear(): Promise<void> {
    if (bombeando) return;
    bombeando = true;
    try {
      while (pendientes.alta.length + pendientes.baja.length > 0) {
        const espera = ultimo + gapMs - now();
        if (espera > 0) await sleep(espera);
        const siguiente = pendientes.alta.shift() ?? pendientes.baja.shift();
        if (!siguiente) continue;
        ultimo = now();
        siguiente();
      }
    } finally {
      bombeando = false;
    }
  }
  function turno(prioridad: Prioridad): Promise<void> {
    return new Promise<void>((resolver) => {
      pendientes[prioridad].push(resolver);
      void bombear();
    });
  }

  async function pedir(url: string, init: RequestInit, prioridad: Prioridad): Promise<Response> {
    for (let intento = 0; ; intento++) {
      await turno(prioridad);
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

  /** Una vista del mismo cliente con otra prioridad: comparte la cola y la pausa. */
  const vista = (prioridad: Prioridad): Http => ({
    userAgent: UA,
    get: (url, init) => pedir(url, init ?? {}, prioridad),
  });

  return { userAgent: UA, get: (url, init) => pedir(url, init ?? {}, 'alta'), conPrioridad: vista };
}
