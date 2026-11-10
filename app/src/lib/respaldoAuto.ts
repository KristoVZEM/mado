import { autoRespaldoDe, etiquetaDia, respaldoDebido } from './datosAjustes.ts';

export interface DepsRespaldo {
  /** Valor guardado de `auto_respaldo`, o `null`. */
  autoRespaldo(): Promise<string | null>;
  /** Valor guardado de `respaldo_ultimo` (milisegundos), o `null`. */
  ultimo(): Promise<string | null>;
  ahora(): number;
  /** Crea el respaldo del día `etiqueta`. */
  crear(etiqueta: string): Promise<unknown>;
  anotar(ms: number): Promise<void>;
}

/**
 * Hace el respaldo automático si toca. Nunca lanza (un respaldo que falla no debe afectar a la app) y no se solapa.
 * Anota la hora solo después de crear el archivo: si falla, se reintenta en la siguiente comprobación.
 */
export function crearRespaldador(deps: DepsRespaldo) {
  let enMarcha = false;
  return {
    /** `true` si hizo un respaldo. */
    async comprobar(): Promise<boolean> {
      if (enMarcha) return false;
      enMarcha = true;
      try {
        const posicion = autoRespaldoDe(await deps.autoRespaldo());
        const ahora = deps.ahora();
        if (!respaldoDebido(posicion, Number((await deps.ultimo()) ?? 0), ahora)) return false;
        await deps.crear(etiquetaDia(ahora));
        await deps.anotar(ahora);
        return true;
      } catch (e) {
        console.error('respaldo automático:', e instanceof Error ? e.message : e);
        return false;
      } finally {
        enMarcha = false;
      }
    },
  };
}
