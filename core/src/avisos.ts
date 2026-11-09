// Motor de avisos de episodios nuevos. Puro: recibe lo guardado y lo disponible y devuelve qué avisar y qué anotar.

export interface SerieVigilada {
  aid: number;
  titulo: string;
  /** Último episodio ya avisado; `null` si nunca se vigiló esta serie. */
  ultimoAvisado: number | null;
  /** Episodio más alto marcado como visto (0 si ninguno). */
  ultimoVisto: number;
  /** Números de episodio que la fuente tiene ahora. */
  disponibles: number[];
}

export interface Aviso {
  aid: number;
  titulo: string;
  /** Episodios nuevos, de menor a mayor. */
  episodios: number[];
}

export interface PlanAvisos {
  avisos: Aviso[];
  guardar: { aid: number; ultimo: number }[];
}

/**
 * La primera vez que se vigila una serie solo se anota lo disponible (sin avalancha de avisos antiguos).
 * Después avisa de lo que supere tanto lo ya avisado como lo ya visto, y anota el mayor disponible.
 */
export function planearAvisos(series: readonly SerieVigilada[]): PlanAvisos {
  const plan: PlanAvisos = { avisos: [], guardar: [] };
  for (const s of series) {
    const validos = s.disponibles.filter((n) => Number.isFinite(n) && n > 0);
    if (validos.length === 0) continue;
    const mayor = Math.max(...validos);
    if (s.ultimoAvisado === null) {
      plan.guardar.push({ aid: s.aid, ultimo: mayor });
      continue;
    }
    const umbral = Math.max(s.ultimoAvisado, s.ultimoVisto);
    const nuevos = validos.filter((n) => n > umbral).sort((a, b) => a - b);
    if (nuevos.length > 0) plan.avisos.push({ aid: s.aid, titulo: s.titulo, episodios: nuevos });
    if (mayor > s.ultimoAvisado) plan.guardar.push({ aid: s.aid, ultimo: mayor });
  }
  return plan;
}

const lista = (e: number[]) => (e.length === 1 ? String(e[0]) : `${e.slice(0, -1).join(', ')} y ${e[e.length - 1]}`);

/** Texto del aviso nativo: una serie con detalle; varias, agrupadas en un solo aviso. */
export function textoAviso(avisos: readonly Aviso[]): { titulo: string; cuerpo: string } {
  if (avisos.length === 1) {
    const { titulo, episodios } = avisos[0];
    return {
      titulo,
      cuerpo: episodios.length === 1 ? `Episodio ${episodios[0]} disponible` : `Episodios ${lista(episodios)} disponibles`,
    };
  }
  return {
    titulo: `${avisos.length} episodios nuevos`,
    cuerpo: avisos.map((a) => `${a.titulo} (${a.episodios[a.episodios.length - 1]})`).join(', '),
  };
}
