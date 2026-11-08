import type { EntradaHistorial } from './datos.ts';

const clave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function etiquetaDe(dia: Date, ahora: Date): string {
  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
  if (clave(dia) === clave(ahora)) return 'Hoy';
  if (clave(dia) === clave(ayer)) return 'Ayer';
  return dia.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Agrupa por día local, en el orden recibido (de más reciente a más antiguo). `ahora` en milisegundos. */
export function agruparPorDia(
  entradas: readonly EntradaHistorial[],
  ahora: number,
): { etiqueta: string; entradas: EntradaHistorial[] }[] {
  const hoy = new Date(ahora);
  const grupos: { clave: string; etiqueta: string; entradas: EntradaHistorial[] }[] = [];
  for (const e of entradas) {
    const dia = new Date(e.vistoEn);
    const k = clave(dia);
    let g = grupos.at(-1);
    if (!g || g.clave !== k) {
      g = { clave: k, etiqueta: etiquetaDe(dia, hoy), entradas: [] };
      grupos.push(g);
    }
    g.entradas.push(e);
  }
  return grupos.map(({ etiqueta, entradas }) => ({ etiqueta, entradas }));
}
