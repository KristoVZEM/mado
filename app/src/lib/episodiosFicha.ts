import { formatoTiempo } from './continuar.ts';

/** Segundo guardado de un episodio a medias. */
export interface ProgresoEp {
  numero: number;
  posicionS: number;
  duracionS: number;
}

export interface Principal {
  tipo: 'continuar' | 'ver' | 'repetir';
  numero: number;
}

/**
 * Qué episodio ofrece el botón grande de la Ficha. `numeros` va de menor a mayor y `progresos` del más reciente
 * al más antiguo. Un episodio a medias gana (el más reciente); si no, el primero sin ver; si ya están todos
 * vistos, vuelve al primero. `null` si la serie no tiene episodios.
 */
export function episodioPrincipal(
  numeros: readonly number[],
  vistos: ReadonlySet<number>,
  progresos: readonly ProgresoEp[],
): Principal | null {
  if (numeros.length === 0) return null;
  const existen = new Set(numeros);
  const aMedias = progresos.find((p) => existen.has(p.numero));
  if (aMedias) return { tipo: 'continuar', numero: aMedias.numero };
  const sinVer = numeros.find((n) => !vistos.has(n));
  if (sinVer !== undefined) return { tipo: 'ver', numero: sinVer };
  return { tipo: 'repetir', numero: numeros[0] };
}

export function textoPrincipal(p: Principal): string {
  if (p.tipo === 'continuar') return `Continuar Ep. ${p.numero}`;
  if (p.tipo === 'ver') return `Ver Ep. ${p.numero}`;
  return `Volver a ver desde el Ep. ${p.numero}`;
}

/** `quedan 9:12`; `null` si no se conoce la duración. */
export function textoQuedan(posicionS: number, duracionS: number): string | null {
  if (!Number.isFinite(duracionS) || duracionS <= 0) return null;
  const pos = Number.isFinite(posicionS) && posicionS > 0 ? posicionS : 0;
  return `quedan ${formatoTiempo(Math.max(0, duracionS - pos))}`;
}
