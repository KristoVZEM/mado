import { open } from '@tauri-apps/plugin-dialog';
import { importarCopia, previsualizarCopia, type ModoImportacion, type ResumenCopia } from './datos.ts';
import { textoDeError } from './errores.ts';
import { textoResultado } from './importar.ts';

export type Fase =
  | { tipo: 'inicio' }
  | { tipo: 'vista'; carpeta: string; resumen: ResumenCopia; confirmando: boolean }
  | { tipo: 'aplicando' }
  | { tipo: 'listo'; texto: string }
  | { tipo: 'error'; texto: string };

/**
 * Estado de la importación de la copia de Ukiku. Vive fuera de Ajustes: si se cierra y se reabre la pantalla
 * mientras se importa, la importación sigue, su resultado no se pierde y no se puede lanzar otra encima.
 */
export const importacion = $state<{ fase: Fase }>({ fase: { tipo: 'inicio' } });

export async function elegirCarpeta(): Promise<void> {
  try {
    const carpeta = await open({ directory: true, multiple: false, title: 'Elegir la carpeta de la copia de Ukiku' });
    if (!carpeta) return;
    importacion.fase = { tipo: 'vista', carpeta, resumen: await previsualizarCopia(carpeta), confirmando: false };
  } catch (e) {
    console.error(e);
    importacion.fase = { tipo: 'error', texto: textoDeError(e) };
  }
}

export function confirmar(confirmando: boolean): void {
  if (importacion.fase.tipo === 'vista') importacion.fase = { ...importacion.fase, confirmando };
}

export function cancelar(): void {
  if (importacion.fase.tipo === 'vista') importacion.fase = { tipo: 'inicio' };
}

/** Solo arranca desde la vista previa: con una importación en curso (`aplicando`) un segundo clic no hace nada. */
export async function importar(modo: ModoImportacion): Promise<void> {
  if (importacion.fase.tipo !== 'vista') return;
  const { carpeta } = importacion.fase;
  importacion.fase = { tipo: 'aplicando' };
  try {
    importacion.fase = { tipo: 'listo', texto: textoResultado(await importarCopia(carpeta, modo)) };
  } catch (e) {
    console.error(e);
    importacion.fase = { tipo: 'error', texto: textoDeError(e) };
  }
}
