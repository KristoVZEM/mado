import { FuenteCambio, SinRed } from '../errors.ts';

export const URL_ANILIST = 'https://graphql.anilist.co';

export interface ClienteAnilist {
  consultar<T = any>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

export interface OpcionesCliente {
  /** En la app, el `fetch` de plugin-http; en pruebas, uno falso. */
  fetch?: typeof fetch;
  limitador: { esperar(): Promise<void> };
  sleep?: (ms: number) => Promise<void>;
  /** Cuántas veces se reintenta tras un 429 (por defecto 2). */
  reintentos429?: number;
}

/** Cliente mínimo de GraphQL (POST). Cada petición pasa por el limitador. */
export function crearClienteAnilist(op: OpcionesCliente): ClienteAnilist {
  const hacerFetch = op.fetch ?? fetch;
  const dormir = op.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxReintentos = op.reintentos429 ?? 2;

  async function consultar<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    for (let intento = 0; ; intento++) {
      await op.limitador.esperar();
      let res: Response;
      try {
        res = await hacerFetch(URL_ANILIST, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ query, variables }),
        });
      } catch (e) {
        throw new SinRed(`sin respuesta de AniList: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
      if (res.status === 429) {
        if (intento >= maxReintentos) throw new SinRed('AniList limita las peticiones (HTTP 429)');
        const segundos = Number(res.headers.get('retry-after'));
        await dormir((Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos, 120) : 60) * 1000);
        continue;
      }
      if (res.status >= 500) throw new SinRed(`AniList no responde (HTTP ${res.status})`);
      if (!res.ok) throw new FuenteCambio(`AniList: HTTP ${res.status}`);
      let cuerpo: any;
      try {
        cuerpo = JSON.parse(await res.text());
      } catch {
        throw new FuenteCambio('AniList: la respuesta no es JSON');
      }
      if (Array.isArray(cuerpo?.errors) && cuerpo.errors.length > 0) {
        throw new FuenteCambio(`AniList: ${String(cuerpo.errors[0]?.message ?? 'error de consulta')}`);
      }
      if (cuerpo?.data == null) throw new FuenteCambio('AniList: la respuesta no trae "data"');
      return cuerpo.data as T;
    }
  }

  return { consultar };
}
