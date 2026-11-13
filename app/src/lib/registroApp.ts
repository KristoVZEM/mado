import { error as anotarError, warn as anotarAviso } from '@tauri-apps/plugin-log';
import { textoParaRegistro } from './registro.ts';

/**
 * Lleva al archivo de registro lo que la app ya escribía en la consola (`console.error` y `console.warn`) y
 * los errores que nadie capturó. La app instalada no tiene consola: sin esto ese detalle se pierde.
 * La consola sigue recibiendo lo mismo, para el desarrollo. Anotar nunca lanza.
 */
export function iniciarRegistro(): void {
  const anotar = (escribir: (texto: string) => Promise<void>, partes: unknown[]) => {
    try {
      void escribir(textoParaRegistro(partes)).catch(() => {});
    } catch {
      // Un fallo al anotar no debe romper a quien avisaba del suyo.
    }
  };
  const errorOriginal = console.error.bind(console);
  const avisoOriginal = console.warn.bind(console);
  console.error = (...partes: unknown[]) => {
    errorOriginal(...partes);
    anotar(anotarError, partes);
  };
  console.warn = (...partes: unknown[]) => {
    avisoOriginal(...partes);
    anotar(anotarAviso, partes);
  };
  window.addEventListener('error', (e) => anotar(anotarError, ['error sin capturar:', e.error ?? e.message]));
  window.addEventListener('unhandledrejection', (e) => anotar(anotarError, ['promesa rechazada sin capturar:', e.reason]));
}
