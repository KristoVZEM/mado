// Nombre en español de cada tipo de relación entre obras de AniList (`MediaRelation`).
const TIPOS_RELACION: Record<string, string> = {
  PREQUEL: 'Precuela',
  SEQUEL: 'Secuela',
  PARENT: 'Historia principal',
  SIDE_STORY: 'Historia paralela',
  SPIN_OFF: 'Spin-off',
  ALTERNATIVE: 'Versión alternativa',
  SUMMARY: 'Resumen',
  CHARACTER: 'Mismos personajes',
  ADAPTATION: 'Adaptación',
  OTHER: 'Relacionada',
};

/** Un tipo que AniList añada más adelante se muestra como «Relacionada». */
export const nombreRelacion = (tipo: string): string => TIPOS_RELACION[tipo] ?? 'Relacionada';
