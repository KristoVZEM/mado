import type {
  ModoImportacion,
  ResultadoArchivo,
  ResultadoCopia,
  ResumenCopia,
  ResumenHistorial,
  ResumenLista,
} from './datos.ts';

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

/** `a`, `a y b`, `a, b y c`. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

function omitidos(n: number): string {
  return n === 0 ? '.' : `; ${n} ${plural(n, 'omitido', 'omitidos')} por datos inválidos.`;
}

/** Línea de la vista previa del `history`. */
export function textoHistorial(r: ResumenHistorial): string {
  return (
    `Historial: ${r.total} ${plural(r.total, 'episodio', 'episodios')} de ${r.series} ${plural(r.series, 'serie', 'series')}: ` +
    `${r.nuevos} ${plural(r.nuevos, 'nuevo', 'nuevos')}, ${r.existentes} ${plural(r.existentes, 'ya estaba', 'ya estaban')}` +
    omitidos(r.invalidos)
  );
}

/** Línea de la vista previa de `following` (Siguiendo) o `favs` (Favoritos). */
export function textoLista(etiqueta: 'Siguiendo' | 'Favoritos', r: ResumenLista): string {
  if (r.total === 0) return `${etiqueta}: el archivo está vacío.`;
  return (
    `${etiqueta}: ${r.total} ${plural(r.total, 'serie', 'series')}: ` +
    `${r.nuevos} ${plural(r.nuevos, 'nueva', 'nuevas')}, ${r.existentes} ${plural(r.existentes, 'ya estaba', 'ya estaban')}` +
    omitidos(r.invalidos)
  );
}

/** Una línea por archivo presente y, si falta alguno, otra con los ausentes. */
export function lineasResumen(r: ResumenCopia): string[] {
  const lineas: string[] = [];
  if (r.historial) lineas.push(textoHistorial(r.historial));
  if (r.siguiendo) lineas.push(textoLista('Siguiendo', r.siguiendo));
  if (r.favoritos) lineas.push(textoLista('Favoritos', r.favoritos));
  if (r.ausentes.length > 0) lineas.push(`No están en la carpeta (no se tocan): ${r.ausentes.join(', ')}.`);
  return lineas;
}

/** Qué hará cada modo, para mostrarlo antes de confirmar. */
export function textoAviso(modo: ModoImportacion, r: ResumenCopia): string {
  if (modo === 'mezclar') {
    const partes: string[] = [];
    if (r.historial) {
      partes.push('Historial: se añaden los episodios nuevos y, si uno ya estaba, se conserva la fecha más reciente.');
    }
    const listas: string[] = [];
    if (r.siguiendo) listas.push('siguiendo');
    if (r.favoritos) listas.push('favoritos');
    if (listas.length > 0) {
      const t = enumerar(listas);
      partes.push(`${t[0].toUpperCase()}${t.slice(1)}: manda la copia.`);
    }
    partes.push('No se borra nada.');
    return partes.join(' ');
  }
  const borrados: string[] = [];
  if (r.historial) {
    borrados.push(`${r.historial.actuales} ${plural(r.historial.actuales, 'episodio visto', 'episodios vistos')}`);
  }
  if (r.siguiendo) {
    borrados.push(`${r.siguiendo.actuales} ${plural(r.siguiendo.actuales, 'serie en siguiendo', 'series en siguiendo')}`);
  }
  if (r.favoritos) borrados.push(`${r.favoritos.actuales} ${plural(r.favoritos.actuales, 'favorito', 'favoritos')}`);
  return (
    `Se borra lo que hay ahora de cada archivo presente (${enumerar(borrados)}) y se carga lo de la copia. ` +
    'Lo que no está en la carpeta no se toca. Antes se guarda una copia de la base.'
  );
}

function resultado(etiqueta: string, r: ResultadoArchivo, nuevo: [string, string], actualizado: [string, string]): string {
  const omit = r.invalidos > 0 ? `; ${r.invalidos} ${plural(r.invalidos, 'omitido', 'omitidos')}` : '';
  return `${etiqueta}: ${r.nuevos} ${plural(r.nuevos, ...nuevo)} y ${r.actualizados} ${plural(r.actualizados, ...actualizado)}${omit}.`;
}

export function textoResultado(r: ResultadoCopia): string {
  const partes: string[] = [];
  if (r.historial) {
    partes.push(resultado('Historial', r.historial, ['episodio nuevo', 'episodios nuevos'], ['actualizado', 'actualizados']));
  }
  if (r.siguiendo) {
    partes.push(resultado('Siguiendo', r.siguiendo, ['serie nueva', 'series nuevas'], ['actualizada', 'actualizadas']));
  }
  if (r.favoritos) {
    partes.push(resultado('Favoritos', r.favoritos, ['favorito nuevo', 'favoritos nuevos'], ['actualizado', 'actualizados']));
  }
  if (r.copia) partes.push('Copia previa de la base guardada.');
  return partes.join(' ');
}
