// Errores tipados del núcleo. La interfaz decide qué mostrar según la clase.

/** Timeout, conexión rechazada o servidor caído (5xx). Es un fallo de red, no de la fuente. */
export class SinRed extends Error {
  name = 'SinRed';
}

/** Cloudflare pide un desafío. No se intenta evadir: la interfaz entra en modo degradado. */
export class Desafio extends Error {
  name = 'Desafio';
}

/** La respuesta ya no tiene la forma esperada: el sitio migró o un extractor dejó de servir. */
export class FuenteCambio extends Error {
  name = 'FuenteCambio';
}

/** Ningún servidor resoluble para ese episodio. Guarda por qué fallaron los que se probaron. */
export class SinServidor extends Error {
  name = 'SinServidor';
  causas: Error[];
  constructor(message: string, causas: Error[] = []) {
    super(message);
    this.causas = causas;
  }
}

/** AniList rechazó el token (caducó o se revocó): hay que volver a iniciar sesión. */
export class NoAutorizado extends Error {
  name = 'NoAutorizado';
}
