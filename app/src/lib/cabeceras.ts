/**
 * Convierte las cabeceras de un Playable al formato de la opción `http-header-fields` de mpv:
 * una lista separada por comas. mpv no tiene escape fiable para una coma dentro de un valor,
 * así que un valor con coma, un nombre con coma o dos puntos, o un salto de línea se rechazan
 * con un error explícito en lugar de corromper la petición en silencio. El error nombra la
 * cabecera pero no su valor: puede llevar un token.
 */
export function cabecerasMpv(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([nombre, valor]) => {
      const mal =
        nombre.includes(',') ||
        nombre.includes(':') ||
        valor.includes(',') ||
        /[\r\n]/.test(nombre + valor);
      if (mal) throw new Error(`la cabecera "${nombre}" no se puede pasar a mpv`);
      return `${nombre}: ${valor}`;
    })
    .join(',');
}
