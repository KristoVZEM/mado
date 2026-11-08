const CDN = 'https://cdn.animeav1.com';

const aidValido = (aid: number) => Number.isSafeInteger(aid) && aid > 0;

/** Portada de una serie (2:3); `null` si el `aid` no vale. */
export function urlPortada(aid: number): string | null {
  return aidValido(aid) ? `${CDN}/covers/${aid}.jpg` : null;
}

/** Captura de un episodio (16:9); `null` si el `aid` o el número no valen. `1` y `1.5` se escriben tal cual. */
export function urlCaptura(aid: number, numero: number): string | null {
  if (!aidValido(aid) || !Number.isFinite(numero) || numero < 0) return null;
  return `${CDN}/screenshots/${aid}/${numero}.jpg`;
}

/** Letra para el recuadro de respaldo cuando la imagen no carga. */
export function inicialDe(titulo: string): string {
  const letra = titulo.trim().charAt(0);
  return letra ? letra.toLocaleUpperCase('es') : '?';
}
