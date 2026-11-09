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
  async function sincronizarSerie(aid: number): Promise<void> {
    const cuenta = await deps.cuenta();
    if (!cuenta || cuenta.ultimaSync === null) return;
    const locales = await deps.locales(aid);
    const l = locales[0];
    if (!l) return; // sin vínculo firme: no se sincroniza
    const r = await desautorizar(() => deps.remotoDe(l.anilistId));
    await aplicar(planificar(locales, r ? [r] : []));
  }

  /** Encola una serie cambiada: espera 5 s y funde los avisos repetidos. Nunca lanza. */
  function avisarCambio(aid: number): void {
    const previo = pendientes.get(aid);
    if (previo !== undefined) temporizador.quitar(previo);
    pendientes.set(
      aid,
      temporizador.poner(() => {
        pendientes.delete(aid);
        sincronizarSerie(aid).catch((e) => console.error('sincronización de una serie:', e instanceof Error ? e.name : e));
      }, RETRASO_AVISO_MS),
    );
  }

  return { previsualizar, aplicar, sincronizar, avisarCambio };
}
