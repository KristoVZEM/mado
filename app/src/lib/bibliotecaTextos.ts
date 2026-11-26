import { nombreEstado, PESTANAS, type Pestana } from './biblioteca.ts';
import { hayFiltros, type EntradaVista, type Filtros } from './bibliotecaVista.ts';

const DIA_MS = 86_400_000;

/** Medianoche local del día de `t`. */
const inicioDelDia = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** «hoy», «ayer», «hace N días» (hasta 13), «hace N sem.» (hasta 8), «hace N meses» (hasta 23), «hace N años». */
export function haceCuanto(ms: number, ahora: number): string {
  // `round`: un cambio de horario deja días de 23 o 25 horas.
  const dias = Math.round((inicioDelDia(ahora) - inicioDelDia(ms)) / DIA_MS);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias <= 13) return `hace ${dias} días`;
  const semanas = Math.floor(dias / 7);
  if (semanas <= 8) return `hace ${semanas} sem.`;
  const meses = Math.floor(dias / 30.44);
  if (meses <= 23) return `hace ${meses} meses`;
  const anios = Math.floor(dias / 365.25);
  return `hace ${anios} ${anios === 1 ? 'año' : 'años'}`;
}

/**
 * Línea bajo el título del póster. `mezcla` (pestaña Todas) pone el estado delante en vez de la fecha, porque ahí
 * conviven series de todos los estados.
 */
export function subtituloTarjeta(e: EntradaVista, mezcla: boolean, ahora: number): string {
  const ep =
    e.ultimoEpisodio === null ? '' : e.total !== null ? `Ep. ${e.ultimoEpisodio} de ${e.total}` : `Ep. ${e.ultimoEpisodio}`;
  if (mezcla) return [nombreEstado(e.estado), ep].filter(Boolean).join(' · ');
  return [ep, e.vistoEn === null ? '' : haceCuanto(e.vistoEn, ahora)].filter(Boolean).join(' · ');
}

const series = (n: number) => `${n} ${n === 1 ? 'serie' : 'series'}`;

export function textoResumen(total: number, viendo: number): string {
  return `${series(total)} · ${viendo} viendo`;
}

export function textoNuevos(n: number): string {
  return `${n} con ${n === 1 ? 'episodio nuevo' : 'episodios nuevos'}`;
}

export function lineaFiltros(mostradas: number, total: number): string {
  return `${mostradas} de ${series(total)}`;
}

export type AccionVacio = 'catalogo' | 'ajustes' | 'quitarFiltros';

export interface EstadoVacio {
  titulo: string;
  texto: string;
  /** Adónde puede ir quien lo ve. */
  acciones: AccionVacio[];
}

/** Qué se dice cuando la cuadrícula queda vacía: por qué y qué hacer. */
export function estadoVacioVista(p: Pestana, f: Filtros, totalBiblioteca: number, totalPestana: number): EstadoVacio {
  const nombre = PESTANAS.find((x) => x.id === p)?.nombre ?? '';
  if (totalBiblioteca === 0) {
    return {
      titulo: 'Tu biblioteca está vacía',
      texto: 'Elige un estado en la Ficha de una serie, o trae tu historial desde una copia de Ukiku.',
      acciones: ['catalogo', 'ajustes'],
    };
  }
  if (totalPestana === 0) {
    return {
      titulo: `No hay series en «${nombre}»`,
      texto: 'Cambia el estado de una serie desde su Ficha o desde el menú «⋯» de su póster.',
      acciones: ['catalogo'],
    };
  }
  const soloFavoritos = f.soloFavoritos && !hayFiltros({ ...f, soloFavoritos: false });
  if (soloFavoritos) {
    return p === 'todos'
      ? { titulo: 'Sin favoritos todavía', texto: 'Marca una serie con ☆ en su Ficha o en su menú «⋯».', acciones: ['quitarFiltros'] }
      : { titulo: `No tienes favoritos en «${nombre}»`, texto: 'Quita el filtro para ver todas las series de esta pestaña.', acciones: ['quitarFiltros'] };
  }
  return { titulo: 'Ninguna serie coincide', texto: 'Prueba con otra búsqueda u otros filtros.', acciones: ['quitarFiltros'] };
}
