import { causaDeFalloDeFuente, type CausaFuente } from './fuente.ts';
import { fuentes } from './fuentes.ts';

/** Estado de la fuente para el aviso global. `causa` es `null` mientras todo va bien. */
export const fuente = $state<{ causa: CausaFuente | null; descartado: boolean; probando: boolean }>({
  causa: null,
  descartado: false,
  probando: false,
});

/** Una pantalla encontró un error: si es un bloqueo de la fuente, se enseña el aviso. Otros errores se ignoran. */
export function avisarFalloDeFuente(e: unknown): void {
  const causa = causaDeFalloDeFuente(e);
  if (causa) fuente.causa = causa;
}

/** Una petición a la fuente salió bien: el aviso se quita y volverá a salir si hay otro fallo. */
export function fuenteRecuperada(): void {
  fuente.causa = null;
  fuente.descartado = false;
}

/** Botón «Reintentar»: una búsqueda corta. Si la fuente contesta (aunque sea con otro error), ya no está bloqueada. */
export async function reintentarFuente(): Promise<void> {
  fuente.probando = true;
  try {
    await fuentes.buscar('one piece');
    fuenteRecuperada();
  } catch (e) {
    if (causaDeFalloDeFuente(e)) fuente.causa = causaDeFalloDeFuente(e);
    else fuenteRecuperada();
  } finally {
    fuente.probando = false;
  }
}
