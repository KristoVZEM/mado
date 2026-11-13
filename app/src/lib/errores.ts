import { Desafio, FuenteCambio, SinRed, SinServidor } from '../../../core/src/errors.ts';

/**
 * Mensaje legible para el usuario. No incluye el texto interno del error: puede llevar rutas o
 * tokens. El detalle va al registro de la app (donde se anota el error original).
 */
export function mensajeDeError(e: unknown): string {
  if (e instanceof SinRed) {
    return 'Sin respuesta de la fuente. Revisa la conexión; si tu proveedor bloquea Cloudflare, prueba con una VPN o con otro servidor de la VPN.';
  }
  if (e instanceof Desafio) {
    return 'La fuente pidió un desafío de Cloudflare y no se puede continuar ahora. Prueba a cambiar de red o de servidor de la VPN y reintenta.';
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
  return 'Error inesperado. El detalle está en el registro (Ajustes > Datos y red).';
}

/** Los rechazos de `invoke` llegan como texto; el resto de errores pasan por `mensajeDeError`. */
export const textoDeError = (e: unknown) => (typeof e === 'string' ? e : mensajeDeError(e));
