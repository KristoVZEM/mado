/**
 * Versión de las reglas de emparejado de títulos (`core/src/anilist/titulos.ts` y `emparejar.ts`). Se sube
 * cuando las reglas cambian de forma que una serie que antes no se encontró podría encontrarse ahora. 1 = las
 * reglas con ordinales, espacios, «½» y subtítulos largos.
 */
export const VERSION_REGLAS_EMPAREJADO = 1;

export interface DepsReglas {
  /** Versión con que se reintentaron los `ninguno` por última vez (0 = nunca). */
  version(): Promise<number>;
  guardarVersion(n: number): Promise<void>;
  /** Hace pendientes todos los vínculos `ninguno`; devuelve cuántos son. */
  reintentarNingunos(): Promise<number>;
}

/**
 * Si las reglas de emparejado cambiaron desde la última vez, los vínculos `ninguno` (series que no se
 * encontraron en AniList) se reintentan ya, en vez de a los 30 días. La versión se guarda después de
 * reintentar: si algo falla, se vuelve a intentar al abrir. Devuelve cuántos `ninguno` se reintentan, o
 * `null` si no hacía falta o falló. Nunca lanza.
 */
export async function reintentarSiCambiaronLasReglas(deps: DepsReglas): Promise<number | null> {
  try {
    if ((await deps.version()) >= VERSION_REGLAS_EMPAREJADO) return null;
    const n = await deps.reintentarNingunos();
    await deps.guardarVersion(VERSION_REGLAS_EMPAREJADO);
    return n;
  } catch (e) {
    console.error('reglas de emparejado:', e instanceof Error ? e.name : e);
    return null;
  }
}
