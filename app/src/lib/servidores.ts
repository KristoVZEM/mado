/** Los servidores que la app sabe resolver. Voe queda fuera a propósito: su dominio rotativo no está permitido (#37). */
const SERVIDORES_DE_LA_APP = ['HLS', 'MP4Upload'] as const;

/** De los servidores del episodio, los que se pueden elegir en la app: sin repetir y en el orden de la página. */
export function servidoresElegibles(delEpisodio: readonly string[]): string[] {
  return [...new Set(delEpisodio)].filter((s) => (SERVIDORES_DE_LA_APP as readonly string[]).includes(s));
}

/** Parámetros de `resolver` para forzar un servidor: ese primero y todos los demás fuera de la cadena. */
export function soloServidor(delEpisodio: readonly string[], elegido: string): { preferido: string; excluidos: string[] } {
  return { preferido: elegido, excluidos: delEpisodio.filter((s) => s !== elegido) };
}
