/** Episodios por página en la Ficha: unas seis filas de la cuadrícula, casi una pantalla. */
export const TAMANO_PAGINA = 24;

/** Parte la lista, tal como se muestra (ascendente o descendente), en páginas de `TAMANO_PAGINA`. */
export function paginar(mostrados: readonly number[], tamano: number = TAMANO_PAGINA): number[][] {
  const paginas: number[][] = [];
  for (let i = 0; i < mostrados.length; i += tamano) paginas.push(mostrados.slice(i, i + tamano));
  return paginas;
}

/** El paginador solo hace falta cuando los episodios no caben en una página. */
export function seMuestraPaginador(total: number, tamano: number = TAMANO_PAGINA): boolean {
  return total > tamano;
}

/** Índice de la página que contiene el episodio `numero`, o -1 si la lista no lo tiene. */
export function paginaDe(mostrados: readonly number[], numero: number, tamano: number = TAMANO_PAGINA): number {
  const i = mostrados.indexOf(numero);
  return i === -1 ? -1 : Math.floor(i / tamano);
}

/** Rango de una página tal como se ve, «1–24» o «800–777»; un solo episodio, solo su número. */
export function etiquetaPagina(pagina: readonly number[]): string {
  if (pagina.length === 0) return '';
  const primero = pagina[0];
  const ultimo = pagina[pagina.length - 1];
  return primero === ultimo ? String(primero) : `${primero}–${ultimo}`;
}
