import { numeroDeAjuste } from './ajustes.ts';

/** Un día en milisegundos: la app comprueba si hay versión nueva como mucho una vez al día. */
export const DIA_MS = 86_400_000;

export interface EntradaComprobar {
  ahora: number;
  /** Milisegundos de la última comprobación que llegó a contestar; 0 si nunca. */
  ultimaMs: number;
  /** Hay un episodio reproduciéndose: una comprobación puede acabar en un aviso que no toca ver ahora. */
  reproduciendo: boolean;
  /** Ajuste «Comprobar al abrir». */
  activado: boolean;
}

/**
 * ¿Toca comprobar de forma automática? No con el ajuste apagado ni con un episodio en marcha (se aplaza y se
 * vuelve a preguntar más tarde). Si el reloj retrocedió, la «última» comprobación es futura y se comprueba en vez de
 * esperar días. El botón «Buscar ahora» no pasa por aquí: siempre comprueba.
 */
export function debeComprobar(e: EntradaComprobar): boolean {
  if (!e.activado || e.reproduciendo) return false;
  if (e.ultimaMs <= 0 || e.ultimaMs > e.ahora) return true;
  return e.ahora - e.ultimaMs >= DIA_MS;
}

export type ClaseError = 'sin-release' | 'red' | 'otro';

/**
 * Clasifica un fallo del actualizador. «Sin release» (aún no hay `latest.json` publicado) no es un error del
 * usuario: equivale a «estás al día». La clasificación mira solo el texto, que a veces trae la URL: nunca se muestra.
 */
export function claseDeError(e: unknown): ClaseError {
  const texto = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (/valid release json/i.test(texto)) return 'sin-release';
  if (/error sending request|error trying to connect|dns error|timed out|network/i.test(texto)) return 'red';
  return 'otro';
}

/** Texto para el usuario. Sin la URL ni el mensaje original del error, que pueden llevar datos de la petición. */
export function mensajeDeError(e: unknown): string {
  switch (claseDeError(e)) {
    case 'sin-release':
      return 'Estás al día.';
    case 'red':
      return 'No se pudo comprobar: revisa la conexión e inténtalo de nuevo.';
    default:
      return 'No se pudo comprobar si hay una versión nueva.';
  }
}

const VERSION_VALIDA = /^[0-9A-Za-z.+-]{1,32}$/;

/** Aviso de versión nueva. La versión llega de un archivo remoto: si no parece una versión, no se muestra. */
export function avisoDeVersion(version: string): string {
  return VERSION_VALIDA.test(version) ? `Mado ${version} está lista.` : 'Hay una versión nueva de Mado.';
}

/** Porcentaje (entero, de 0 a 100) de la descarga; `null` si no se conoce el tamaño total. */
export function porcentaje(total: number | null | undefined, acumulado: number): number | null {
  if (!total || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.floor((acumulado / total) * 100)));
}

/** `actualizar_al_abrir`: comprobar al abrir la app. Activado por defecto; solo un 0 lo apaga. */
export function actualizarAlAbrirDe(valor: string | null | undefined): boolean {
  return numeroDeAjuste(valor, 1, 0, 1) === 1;
}
