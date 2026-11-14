import { crearMemoria, crearRestaurador } from './desplazamiento.ts';

// Lo que toca el navegador: la posición de la página, los fotogramas y los gestos del usuario. La lógica está en
// `desplazamiento.ts`.

const memoria = crearMemoria();

const restaurador = crearRestaurador({
  maximo: () => document.documentElement.scrollHeight - window.innerHeight,
  desplazarA: (y) => window.scrollTo(0, y),
  ahora: () => performance.now(),
  siguienteFotograma: (cb) => void requestAnimationFrame(() => cb()),
});

// Si el usuario se mueve mientras se espera a que cargue la página, no se le pelea el desplazamiento.
const GESTOS = ['wheel', 'touchmove', 'keydown'] as const;

function alGesto(e: Event): void {
  // Las teclas que solo modifican (Alt+← de «Volver») y las repeticiones del mismo gesto no cuentan.
  if (e instanceof KeyboardEvent && (e.repeat || ['Alt', 'Control', 'Meta', 'Shift'].includes(e.key))) return;
  dejarDeEscuchar();
  restaurador.cancelar();
}

function dejarDeEscuchar(): void {
  for (const g of GESTOS) window.removeEventListener(g, alGesto);
}

/** Anota hasta dónde se había bajado en la vista que se deja. `null` (el Reproductor) no anota nada. */
export function recordarDesplazamiento(clave: string | null): void {
  if (clave !== null) memoria.guardar(clave, window.scrollY);
}

/**
 * Una vista nueva empieza arriba. La página puede conservar la altura de la anterior (una serie larga bajada del
 * todo), y no debe heredarla. También cancela una restauración que estuviera esperando.
 */
export function irArriba(): void {
  restaurador.cancelar();
  dejarDeEscuchar();
  window.scrollTo(0, 0);
}

/** Devuelve la vista a donde se dejó, esperando a que cargue su contenido. Sin nada anotado, no hace nada. */
export function restaurarDesplazamiento(clave: string | null): void {
  restaurador.cancelar();
  dejarDeEscuchar();
  const y = clave === null ? undefined : memoria.leer(clave);
  if (y === undefined) return;
  for (const g of GESTOS) window.addEventListener(g, alGesto, { passive: true });
  restaurador.iniciar(y);
}
