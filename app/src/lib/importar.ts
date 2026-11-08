import type { ModoImportacion, ResultadoImportacion, ResumenImportacion } from './datos.ts';

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/** Frase de la vista previa: lo que trae el archivo frente a lo que ya hay. */
export function textoResumen(r: ResumenImportacion): string {
  const base =
    `${r.total} ${plural(r.total, 'episodio', 'episodios')} de ${r.series} ${plural(r.series, 'serie', 'series')}: ` +
    `${r.nuevos} ${plural(r.nuevos, 'nuevo', 'nuevos')}, ` +
    `${r.existentes} ${plural(r.existentes, 'ya estaba', 'ya estaban')}`;
  if (r.invalidos === 0) return `${base}.`;
  return `${base}; ${r.invalidos} ${plural(r.invalidos, 'omitido', 'omitidos')} por datos inválidos.`;
}

/** Qué hará cada modo, para mostrarlo antes de confirmar. */
export function textoAviso(modo: ModoImportacion, r: ResumenImportacion): string {
  if (modo === 'mezclar') {
    return 'Se añaden los episodios nuevos y, si uno ya estaba, se conserva la fecha más reciente. No se borra nada.';
  }
  const actuales =
    r.actuales === 0
      ? 'No hay episodios vistos actuales que borrar.'
      : `${plural(r.actuales, 'Se borrará', 'Se borrarán')} ${r.actuales} ${plural(r.actuales, 'episodio visto actual', 'episodios vistos actuales')}`;
  const cola = r.actuales === 0 ? '' : ' y se cargarán los del archivo.';
  return `${actuales}${cola} Antes se guarda una copia de la base.`;
}

export function textoResultado(r: ResultadoImportacion): string {
  const partes =
    `Importados ${r.nuevos} ${plural(r.nuevos, 'episodio nuevo', 'episodios nuevos')} ` +
    `y ${r.actualizados} ${plural(r.actualizados, 'actualizado', 'actualizados')}`;
  const omitidos = r.invalidos > 0 ? `; ${r.invalidos} ${plural(r.invalidos, 'omitido', 'omitidos')}` : '';
  const copia = r.copia ? ' Copia previa de la base guardada.' : '';
  return `${partes}${omitidos}.${copia}`;
}
