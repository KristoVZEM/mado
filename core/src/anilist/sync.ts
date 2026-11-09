// Motor de sincronización de la lista con AniList. Es puro: recibe lo local y lo remoto y devuelve un
// plan. No toca la red ni la base. Las horas van en milisegundos.

/** Tope de episodios que una bajada marca como vistos (mismo que `MAX_PROGRESO` de Rust). */
export const MAX_PROGRESO = 5000;

/** 1 Viendo, 2 Considerando, 3 Completado, 4 Dropeado, 5 Pausado. */
export type EstadoLocal = 1 | 2 | 3 | 4 | 5;

export const STATUS: Record<EstadoLocal, string> = {
  1: 'CURRENT',
  2: 'PLANNING',
  3: 'COMPLETED',
  4: 'DROPPED',
  5: 'PAUSED',
};

/** `REPEATING` se trata como Viendo al bajar; nunca se escribe de vuelta. */
export function aEstadoLocal(status: string): EstadoLocal | null {
  if (status === 'REPEATING') return 1;
  const par = (Object.entries(STATUS) as [string, string][]).find(([, s]) => s === status);
  return par ? (Number(par[0]) as EstadoLocal) : null;
}

export interface LocalSync {
  aid: number;
  anilistId: number;
  /** `null` si la serie no está en `siguiendo`. */
  estado: number | null;
  /** Hora del cambio de estado; 0 si no se conoce. */
  actualizado: number;
  /** Episodio entero más alto visto. */
  progreso: number;
  /** Total de episodios de la obra, si se conoce. */
  episodios: number | null;
}

export interface RemotoSync {
  anilistId: number;
  estado: EstadoLocal;
  /** `updatedAt` de AniList ya convertido a milisegundos. */
  actualizado: number;
  progreso: number;
}

export interface Subida {
  anilistId: number;
  estado?: EstadoLocal;
  progreso?: number;
}

export interface Bajada {
  aid: number;
  estado?: EstadoLocal;
  /** Hora remota del estado (ms), para que local no parezca más nuevo de lo que es. */
  estadoEn?: number;
  progreso?: number;
}

export interface Plan {
  subir: Subida[];
  bajar: Bajada[];
  /** Series cuyo estado difería en ambos lados. */
  conflictos: number;
}

/**
 * Reglas: el estado difiere -> gana el cambio más reciente (empate: AniList); el progreso -> gana el
 * mayor (nunca retrocede). Una serie Completada con progreso menor al total se completa. Solo existen
 * las series locales vinculadas: una entrada remota sin serie local se ignora. Si varias series locales
 * apuntan a la misma obra, cuenta la de menor `aid`.
 */
export function planificar(locales: readonly LocalSync[], remotos: readonly RemotoSync[]): Plan {
  const remoto = new Map(remotos.map((r) => [r.anilistId, r]));
  const vistas = new Set<number>();
  const plan: Plan = { subir: [], bajar: [], conflictos: 0 };

  for (const l of [...locales].sort((a, b) => a.aid - b.aid)) {
    if (vistas.has(l.anilistId)) continue;
    vistas.add(l.anilistId);
    const r = remoto.get(l.anilistId);

    let estado: number | null;
    let estadoEn: number | undefined;
    if (r === undefined || l.estado === r.estado) {
      estado = l.estado ?? r?.estado ?? null;
    } else if (l.estado === null) {
      estado = r.estado;
      estadoEn = r.actualizado;
    } else {
      plan.conflictos++;
      if (l.actualizado > r.actualizado) {
        estado = l.estado;
      } else {
        estado = r.estado;
        estadoEn = r.actualizado;
      }
    }
    if (estado === null) continue; // sin estado en ningún lado no se crea nada

    let progreso = Math.min(Math.max(l.progreso, r?.progreso ?? 0), MAX_PROGRESO);
    if (estado === 3 && l.episodios !== null && progreso < l.episodios) progreso = Math.min(l.episodios, MAX_PROGRESO);

    const bajar: Bajada = { aid: l.aid };
    if (estado !== l.estado) {
      bajar.estado = estado as EstadoLocal;
      if (estadoEn !== undefined) bajar.estadoEn = estadoEn;
    }
    if (progreso > l.progreso) bajar.progreso = progreso;
    if (bajar.estado !== undefined || bajar.progreso !== undefined) plan.bajar.push(bajar);

    const subir: Subida = { anilistId: l.anilistId };
    if (r === undefined) {
      subir.estado = estado as EstadoLocal;
      if (progreso > 0) subir.progreso = progreso;
    } else {
      if (estado !== r.estado) subir.estado = estado as EstadoLocal;
      if (progreso > r.progreso) subir.progreso = progreso;
    }
    if (subir.estado !== undefined || subir.progreso !== undefined) plan.subir.push(subir);
  }
  return plan;
}
