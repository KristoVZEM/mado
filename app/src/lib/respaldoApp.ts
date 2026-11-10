import { crearRespaldo, guardarAjuste, leerAjuste } from './datos.ts';
import { crearRespaldador } from './respaldoAuto.ts';

const REVISAR_CADA_MS = 6 * 3_600_000;

const respaldador = crearRespaldador({
  autoRespaldo: () => leerAjuste('auto_respaldo'),
  ultimo: () => leerAjuste('respaldo_ultimo'),
  ahora: () => Date.now(),
  crear: crearRespaldo,
  anotar: (ms) => guardarAjuste('respaldo_ultimo', String(ms)),
});

/** Mira si toca un respaldo al arrancar y, con la app abierta mucho rato, cada 6 horas. */
export function iniciarRespaldoAutomatico(): void {
  void respaldador.comprobar();
  setInterval(() => void respaldador.comprobar(), REVISAR_CADA_MS);
}
