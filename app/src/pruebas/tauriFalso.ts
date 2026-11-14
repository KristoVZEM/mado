type Calculada = (args: unknown) => unknown;
// Unión explícita: con `unknown | función` TypeScript lo reduce a `unknown` y no infiere los argumentos.
type Respuesta = Calculada | object | string | number | boolean | null | undefined;

const respuestas = new Map<string, Respuesta>();
const llamadas = new Map<string, unknown[]>();

/** Declara qué devuelve un comando de Tauri: un valor fijo o una función de sus argumentos. */
export function responder(comando: string, respuesta: Respuesta): void {
  respuestas.set(comando, respuesta);
}

/** Los argumentos de cada llamada que ha recibido un comando, en orden. */
export function llamadasA(comando: string): unknown[] {
  return llamadas.get(comando) ?? [];
}

/** Borra lo declarado y las llamadas: cada prueba empieza de cero. */
export function reiniciarTauri(): void {
  respuestas.clear();
  llamadas.clear();
}

/** Sustituto de `invoke`: un comando que nadie declaró falla con su nombre, para no pasar en silencio. */
export async function invokeFalso(comando: string, args?: unknown): Promise<unknown> {
  llamadas.set(comando, [...llamadasA(comando), args]);
  if (!respuestas.has(comando)) throw new Error(`comando sin falsear: ${comando}`);
  const r = respuestas.get(comando);
  return typeof r === 'function' ? (r as Calculada)(args) : r;
}
