import type { PendienteEmparejar } from './datos.ts';

export interface DepsEmparejador {
  pendientes(limite: number): Promise<PendienteEmparejar[]>;
  emparejar(p: PendienteEmparejar): Promise<'ok' | 'error'>;
  pausa(ms: number): Promise<void>;
  /** Falso si la app no está a la vista o se está cerrando: la pasada se detiene. */
  activo(): boolean;
  /** Series por tanda (por defecto 10). */
  tanda?: number;
  /** Pausa entre series (por defecto 3 s, unas 20 por minuto, bajo el tope de AniList). */
  pausaMs?: number;
}

/**
 * Empareja las series pendientes con AniList de una en una. Cada serie se intenta una sola vez por
 * pasada; la pasada termina al agotarse las pendientes, si `activo()` es falso o si una tanda entera
 * falla (para no entrar en un bucle de errores, p. ej. sin red).
 */
export function crearEmparejador(deps: DepsEmparejador) {
  const tanda = deps.tanda ?? 10;
  const pausaMs = deps.pausaMs ?? 3000;

  async function correr(): Promise<{ procesadas: number }> {
    const intentadas = new Set<number>();
    let procesadas = 0;
    while (deps.activo()) {
      const lote = (await deps.pendientes(tanda)).filter((x) => !intentadas.has(x.aid));
      if (lote.length === 0) break;
      let bien = 0;
      for (const x of lote) {
        if (!deps.activo()) return { procesadas };
        if (procesadas > 0) await deps.pausa(pausaMs);
        intentadas.add(x.aid);
        const r = await deps.emparejar(x).catch((): 'error' => 'error');
        procesadas++;
        if (r === 'ok') bien++;
      }
      if (bien === 0) break;
    }
    return { procesadas };
  }

  return { correr };
}
