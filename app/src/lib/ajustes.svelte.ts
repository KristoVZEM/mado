import { LIMITES, numeroDeAjuste, volumenInicial } from './ajustes.ts';
import { guardarAjuste, leerAjuste } from './datos.ts';
import { SALTO_CORTO_S, SALTO_LARGO_S } from './saltos.ts';

/** Ajustes en memoria, con los valores por defecto hasta que `asegurarAjustes` los lee de la base. */
export const ajustes = $state({
  volumen: 100,
  saltoCorto: SALTO_CORTO_S,
  saltoLargo: SALTO_LARGO_S,
  velocidad: 1,
});

/** Guarda un ajuste sin esperar ni propagar fallos: los datos nunca bloquean la reproducción. */
export function guardarAjusteSilencioso(clave: string, valor: string): void {
  guardarAjuste(clave, valor).catch((e) => console.error(`no se pudo guardar el ajuste ${clave}`, e));
}

/** localStorage puede faltar o lanzar (ventana privada, datos bloqueados): se trata como ausente. */
function leerLocal(clave: string): string | null {
  try {
    return globalThis.localStorage?.getItem(clave) ?? null;
  } catch {
    return null;
  }
}

function quitarLocal(clave: string): void {
  try {
    globalThis.localStorage?.removeItem(clave);
  } catch {
    // Sin almacén no hay nada que limpiar.
  }
}

async function leerSeguro(clave: string): Promise<string | null> {
  try {
    return await leerAjuste(clave);
  } catch (e) {
    console.error(`no se pudo leer el ajuste ${clave}`, e);
    return null;
  }
}

async function cargar(): Promise<void> {
  const [volumen, corto, largo, velocidad] = await Promise.all([
    leerSeguro('volumen'),
    leerSeguro('salto_corto'),
    leerSeguro('salto_largo'),
    leerSeguro('velocidad'),
  ]);
  // Migración única del volumen: de localStorage (antes de existir la base) a la base.
  const inicial = volumenInicial(volumen, leerLocal('ukiku.volumen'));
  ajustes.volumen = inicial.valor;
  if (inicial.migrar) {
    guardarAjuste('volumen', String(inicial.valor)).then(
      () => quitarLocal('ukiku.volumen'),
      (e) => console.error('no se pudo migrar el volumen', e),
    );
  }
  ajustes.saltoCorto = numeroDeAjuste(corto, SALTO_CORTO_S, ...LIMITES.saltoCorto);
  ajustes.saltoLargo = numeroDeAjuste(largo, SALTO_LARGO_S, ...LIMITES.saltoLargo);
  ajustes.velocidad = numeroDeAjuste(velocidad, 1, ...LIMITES.velocidad);
}

let cargado: Promise<void> | null = null;

/** Lee los ajustes de la base una sola vez (memoizada); nunca rechaza. */
export function asegurarAjustes(): Promise<void> {
  cargado ??= cargar().catch((e) => console.error('no se pudieron cargar los ajustes', e));
  return cargado;
}
