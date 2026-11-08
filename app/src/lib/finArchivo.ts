/** Motivos de `end-file` de mpv que significan que el vídeo no se pudo cargar o se cortó. */
export function esFalloDeReproduccion(evento: { event?: string; reason?: string }): boolean {
  return evento.event === 'end-file' && evento.reason === 'error';
}
