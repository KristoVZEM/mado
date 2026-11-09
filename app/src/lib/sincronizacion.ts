import { NoAutorizado, planificar } from '../../../core/src/index.ts';
import type { Bajada, LocalSync, Plan, RemotoSync, ResultadoSubida, Subida } from '../../../core/src/index.ts';
import type { Cuenta } from './datos.ts';

export interface DepsSync {
  cuenta(): Promise<Cuenta | null>;
  locales(aid?: number): Promise<LocalSync[]>;
  remotos(userId: number): Promise<RemotoSync[]>;
  /** La entrada del usuario para una obra, o `null` si no la tiene. */
  remotoDe(anilistId: number): Promise<RemotoSync | null>;
  subir(cambios: Subida[]): Promise<ResultadoSubida>;
  bajar(bajadas: Bajada[]): Promise<number>;
  marcarSincronizada(): Promise<void>;
  /** AniList rechazó el token: borrarlo y desconectar. */
  alDesautorizar(): Promise<void>;
  ahora(): number;
  temporizador?: { poner(f: () => void, ms: number): unknown; quitar(t: unknown): void };
}

export interface ResumenSync {
  subidas: number;
  bajadas: number;
  conflictos: number;
  fallos: number;
}

const RETRASO_AVISO_MS = 5000;

/** Esperas entre reintentos tras un fallo: 30 s, 2 min, 10 min y 30 min. Después lo recoge la sincronización al abrir. */
export const ESPERAS_REINTENTO_MS = [30_000, 120_000, 600_000, 1_800_000] as const;

/**
 * Orquesta la sincronización. Siempre baja primero (una transacción en Rust) y sube después; si bajar
 * falla no se sube nada. La primera vez no corre sola: hace falta `previsualizar()` y que el usuario
 * confirme con `aplicar()`.
 */
export function crearSincronizador(deps: DepsSync) {
  const temporizador = deps.temporizador ?? {
    poner: (f: () => void, ms: number) => setTimeout(f, ms),
    quitar: (t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>),
  };
  let enCurso: Promise<ResumenSync | 'primera' | 'sin-cuenta'> | null = null;
  const pendientes = new Map<number, unknown>();
  const reintentos = new Map<string, unknown>();

  async function desautorizar<T>(trabajo: () => Promise<T>): Promise<T> {
    try {
      return await trabajo();
    } catch (e) {
      if (e instanceof NoAutorizado) await deps.alDesautorizar();
      throw e;
    }
  }

  async function previsualizar(): Promise<Plan> {
    const cuenta = await deps.cuenta();
    if (!cuenta) throw new Error('no hay una cuenta de AniList conectada');
    const [locales, remotos] = await Promise.all([deps.locales(), desautorizar(() => deps.remotos(cuenta.usuarioId))]);
    return planificar(locales, remotos);
  }

  async function aplicar(plan: Plan): Promise<ResumenSync> {
    if (plan.bajar.length > 0) await deps.bajar(plan.bajar);
    let fallos = 0;
    if (plan.subir.length > 0) {
      const r = await desautorizar(() => deps.subir(plan.subir));
      fallos = r.fallos.length;
    }
    if (fallos === 0) await deps.marcarSincronizada();
    return { subidas: plan.subir.length, bajadas: plan.bajar.length, conflictos: plan.conflictos, fallos };
  }

  function sincronizar(): Promise<ResumenSync | 'primera' | 'sin-cuenta'> {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const cuenta = await deps.cuenta();
      if (!cuenta) return 'sin-cuenta' as const;
      if (cuenta.ultimaSync === null) return 'primera' as const;
      return aplicar(await previsualizar());
    })().finally(() => {
      enCurso = null;
    });
    return enCurso;
  }

  /** Sube una sola serie (la que acaba de cambiar), respetando que el progreso no retrocede. */
  async function sincronizarSerie(aid: number): Promise<ResumenSync | null> {
    const cuenta = await deps.cuenta();
    if (!cuenta || cuenta.ultimaSync === null) return null;
    const locales = await deps.locales(aid);
    const l = locales[0];
    if (!l) return null; // sin vínculo firme: no se sincroniza
    const r = await desautorizar(() => deps.remotoDe(l.anilistId));
    return aplicar(planificar(locales, r ? [r] : []));
  }

  /**
   * Ejecuta `trabajo` y, si falla (error o subidas rechazadas), lo vuelve a intentar con las esperas de
   * `ESPERAS_REINTENTO_MS`. Un `NoAutorizado` no se reintenta: el token ya se borró. Una sola cadena por
   * `clave`; si ya hay una esperando, se sustituye. Nunca lanza.
   */
  async function conReintentos(clave: string, trabajo: () => Promise<{ fallos: number } | null>, intento = 0): Promise<void> {
    cancelarReintento(clave);
    let fallo = false;
    try {
      const r = await trabajo();
      fallo = r !== null && r.fallos > 0;
    } catch (e) {
      console.error('sincronización:', e instanceof Error ? e.name : e);
      if (e instanceof NoAutorizado) return;
      fallo = true;
    }
    const espera = ESPERAS_REINTENTO_MS[intento];
    if (!fallo || espera === undefined) return;
    reintentos.set(
      clave,
      temporizador.poner(() => {
        reintentos.delete(clave);
        // Un reintento no se solapa con una sincronización completa en curso: espera a que termine.
        const turno = enCurso ? enCurso.then(() => {}, () => {}) : Promise.resolve();
        void turno.then(() => conReintentos(clave, trabajo, intento + 1));
      }, espera),
    );
  }

  function cancelarReintento(clave: string): void {
    const t = reintentos.get(clave);
    if (t === undefined) return;
    temporizador.quitar(t);
    reintentos.delete(clave);
  }

  /** Encola una serie cambiada: espera 5 s y funde los avisos repetidos. Nunca lanza. */
  function avisarCambio(aid: number): void {
    const previo = pendientes.get(aid);
    if (previo !== undefined) temporizador.quitar(previo);
    cancelarReintento(`serie:${aid}`); // un cambio nuevo empieza de cero
    pendientes.set(
      aid,
      temporizador.poner(() => {
        pendientes.delete(aid);
        void conReintentos(`serie:${aid}`, () => sincronizarSerie(aid));
      }, RETRASO_AVISO_MS),
    );
  }

  /**
   * Sincronización completa de la apertura, con reintentos si falla. `alResultado` recibe el resultado de
   * cada intento que termina. Nunca lanza.
   */
  async function sincronizarConReintentos(alResultado?: (r: ResumenSync | 'primera' | 'sin-cuenta') => void): Promise<void> {
    await conReintentos('todo', async () => {
      const r = await sincronizar();
      alResultado?.(r);
      return typeof r === 'object' ? r : null;
    });
  }

  return { previsualizar, aplicar, sincronizar, avisarCambio, sincronizarConReintentos };
}
