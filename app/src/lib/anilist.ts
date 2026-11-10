import { UMBRAL_AUTO } from '../../../core/src/anilist/emparejar.ts';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Último episodio ya emitido: en emisión, el siguiente menos uno; terminada, el total; si no se sabe, `null`.
 */
export function ultimoEmitido(m: { siguienteEp: number | null; episodios: number | null; estado: string | null }): number | null {
  if (m.siguienteEp !== null) return Math.max(0, m.siguienteEp - 1);
  if (m.estado === 'FINISHED' && m.episodios !== null) return m.episodios;
  return null;
}

/** `true` si ya salió algún episodio que no has visto. */
export function hayNuevo(emitido: number | null, ultimoVisto: number | null): boolean {
  return emitido !== null && emitido > 0 && emitido > (ultimoVisto ?? 0);
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «Ep. 5 hoy a las 18:30», «mañana» o «el sábado»; `null` si falta el episodio o la hora. */
export function textoProximo(siguienteEp: number | null, siguienteEn: number | null, ahoraS: number): string | null {
  if (siguienteEp === null || siguienteEn === null) return null;
  const cuando = new Date(siguienteEn * 1000);
  const hoy = new Date(ahoraS * 1000);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dif = Math.round((dia(cuando) - dia(hoy)) / DIA_MS);
  const hora = `${cuando.getHours()}:${String(cuando.getMinutes()).padStart(2, '0')}`;
  const cuandoTexto = dif === 0 ? 'hoy' : dif === 1 ? 'mañana' : `el ${DIAS[cuando.getDay()]}`;
  return `Ep. ${siguienteEp} ${cuandoTexto} a las ${hora}`;
}

/** Vínculo automático con poca confianza: la Ficha pregunta «¿Es esta serie?». */
export function esDudoso(v: { origen: string; confianza: number }): boolean {
  return v.origen === 'auto' && v.confianza < UMBRAL_AUTO;
}

const HORA_MS = 60 * 60 * 1000;

/**
 * Hay que volver a pedir la obra: pasaron más de 24 h, o está en emisión y ya pasó su hora de episodio. Si todavía
 * no tiene la duración del episodio (obras guardadas antes de pedirla), basta con 1 h.
 */
export function necesitaRefresco(
  m: {
    actualizado?: number;
    siguienteEn: number | null;
    duracion?: number | null;
    relaciones?: { portada: string | null }[];
  },
  ahoraMs: number,
): boolean {
  // Las relaciones guardadas antes de pedir sus portadas no las traen: se vuelven a pedir en una hora.
  const sinPortadas = (m.relaciones?.length ?? 0) > 0 && m.relaciones!.every((r) => !r.portada);
  const caduca = m.duracion === null || sinPortadas ? HORA_MS : DIA_MS;
  if (m.actualizado === undefined || ahoraMs - m.actualizado > caduca) return true;
  return m.siguienteEn !== null && m.siguienteEn * 1000 <= ahoraMs;
}
