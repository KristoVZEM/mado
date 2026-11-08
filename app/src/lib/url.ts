/**
 * Última comprobación antes de dárselo a mpv, que acepta esquemas como `file://` o `lavfi://`.
 * `new URL` depura la entrada (quita tabulaciones y saltos de línea, y espacios y caracteres de
 * control de los extremos), pero mpv recibe el texto sin depurar: por eso se rechaza cualquier
 * espacio o carácter de control. El error no incluye la URL, que puede llevar un token.
 */
export function validarUrlDeStream(url: string): string {
  const mal = () => new Error('la URL del stream no es válida');
  if (typeof url !== 'string' || /[\u0000-\u0020\u007f]/.test(url)) throw mal();
  let analizada: URL;
  try {
    analizada = new URL(url);
  } catch {
    throw mal();
  }
  if (analizada.protocol !== 'https:' || analizada.hostname === '') throw mal();
  return url;
}
