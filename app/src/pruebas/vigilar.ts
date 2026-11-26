import { vi } from 'vitest';
import { tick } from 'svelte';
import { nav } from '../lib/navegacion.svelte.ts';
import { SECCION_INICIAL } from '../lib/carril.ts';
import { SIN_FILTROS } from '../lib/bibliotecaVista.ts';

// Mensajes de consola que son comportamiento legítimo de la app y no un fallo. Cada uno con su motivo.
// Un mensaje por un falseo que falta se arregla falseando; nunca se añade aquí.
export const PERMITIDOS: RegExp[] = [];

const comoTexto = (a: unknown[]) => a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');

/** Recoge `console.error` y `console.warn` mientras dura la prueba, sin dejarlos salir. */
export function vigilarConsola() {
  const todos: string[] = [];
  const e = vi.spyOn(console, 'error').mockImplementation((...a) => void todos.push(`error: ${comoTexto(a)}`));
  const w = vi.spyOn(console, 'warn').mockImplementation((...a) => void todos.push(`warn: ${comoTexto(a)}`));
  return {
    mensajes: () => todos.filter((m) => !PERMITIDOS.some((r) => r.test(m))),
    parar() {
      e.mockRestore();
      w.mockRestore();
    },
  };
}

/** Deja que las pantallas terminen sus cargas asíncronas (comandos falsos, promesas encadenadas). */
export async function asentar(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await tick();
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * `nav` es un singleton del módulo y el Catálogo guarda ahí sus filas ya cargadas mientras la app está abierta:
 * sin esto, una prueba hereda lo que cargó la anterior. Refleja el estado inicial de `navegacion.svelte.ts`.
 */
export function reiniciarNavegacion(): void {
  nav.seccion = SECCION_INICIAL;
  nav.superior = null;
  nav.catalogo = { texto: '', resultados: [], buscado: false, pendiente: false, listados: {}, abierto: null, enfoque: 0 };
  nav.biblioteca = { pestana: 'todos', filtros: { ...SIN_FILTROS } };
}
