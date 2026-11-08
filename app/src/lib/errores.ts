import { Desafio, FuenteCambio, SinRed, SinServidor } from '../../../core/src/errors.ts';

/**
 * Mensaje legible para el usuario. No incluye el texto interno del error: puede llevar rutas o
 * tokens. El detalle va a la consola (donde se registra el error original).
 */
export function mensajeDeError(e: unknown): string {
  if (e instanceof SinRed) {
    return 'Sin respuesta de la fuente. Revisa la conexión; si tu proveedor bloquea Cloudflare, prueba con una VPN.';
  }
  if (e instanceof Desafio) {
    return 'La fuente pidió un desafío de Cloudflare y no se puede continuar ahora.';
  }
  if (e instanceof FuenteCambio) {
    return 'La fuente cambió su formato. Hay que actualizar el cliente.';
  }
  if (e instanceof SinServidor) {
    if (e.causas.length === 0) {
      return 'Este episodio no tiene servidores disponibles en el idioma elegido.';
    }
    return `Ningún servidor pudo reproducir este episodio (${e.causas.length} intentos fallidos).`;
  }
  return 'Error inesperado. Mira la consola para ver el detalle.';
}
