import { entradaDe, guardarEntradas, listaUsuario, obtenerUsuario } from '../../../core/src/index.ts';
import type { Plan } from '../../../core/src/index.ts';
import { clienteCuenta, olvidarTokenEnMemoria } from './anilistCliente.ts';
import {
  aplicarBajadas,
  borrarCuenta,
  borrarTokenAnilist,
  estadoDatos,
  guardarCuenta,
  guardarTokenAnilist,
  leerCuenta,
  marcarSincronizada,
  seriesParaSync,
  type Cuenta,
} from './datos.ts';
import { textoDeError } from './errores.ts';
import { crearSincronizador, type ResumenSync } from './sincronizacion.ts';

export const sync = $state<{
  cuenta: Cuenta | null;
  fase: 'reposo' | 'trabajando' | 'vista-previa' | 'error';
  mensaje: string;
  plan: Plan | null;
}>({ cuenta: null, fase: 'reposo', mensaje: '', plan: null });

async function desconectarPorToken() {
  await borrarTokenAnilist().catch(() => {});
  olvidarTokenEnMemoria();
  await borrarCuenta().catch(() => {});
  sync.cuenta = null;
}

const sincronizador = crearSincronizador({
  cuenta: leerCuenta,
  locales: (aid) => seriesParaSync(aid),
  remotos: (userId) => listaUsuario(clienteCuenta, userId),
  remotoDe: (anilistId) => entradaDe(clienteCuenta, anilistId),
  subir: (cambios) => guardarEntradas(clienteCuenta, cambios),
  bajar: aplicarBajadas,
  marcarSincronizada,
  alDesautorizar: desconectarPorToken,
  ahora: () => Date.now(),
});

export const urlDeAutorizacion = (clientId: number) =>
  `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&response_type=token`;

export async function cargarCuenta() {
  try {
    sync.cuenta = await leerCuenta();
  } catch (e) {
    console.error(e);
    sync.cuenta = null;
  }
}

function textoResumen(r: ResumenSync): string {
  const base = `${r.subidas} subidas, ${r.bajadas} bajadas, ${r.conflictos} conflictos`;
  return r.fallos > 0 ? `${base}; ${r.fallos} series fallaron y se reintentarán` : base;
}

function fallo(e: unknown, accion = 'sincronizar') {
  console.error(e instanceof Error ? e.name : e);
  sync.fase = 'error';
  sync.mensaje =
    e instanceof Error && e.name === 'NoAutorizado'
      ? 'AniList rechazó el token. Vuelve a conectar la cuenta.'
      : `No se pudo ${accion}: ${textoDeError(e)}`;
}

/** Conecta la cuenta con el token pegado. Si algo falla, no queda nada guardado. */
export async function conectar(token: string) {
  sync.fase = 'trabajando';
  sync.mensaje = 'Comprobando el token…';
  try {
    await guardarTokenAnilist(token);
    olvidarTokenEnMemoria();
    const usuario = await obtenerUsuario(clienteCuenta);
    await guardarCuenta(usuario.id, usuario.nombre);
    sync.cuenta = await leerCuenta();
    sync.fase = 'reposo';
    sync.mensaje = `Conectado como ${usuario.nombre}.`;
  } catch (e) {
    await borrarTokenAnilist().catch(() => {});
    olvidarTokenEnMemoria();
    fallo(e, 'conectar');
  }
}

export async function desconectar() {
  await desconectarPorToken();
  sync.fase = 'reposo';
  sync.mensaje = 'Cuenta desconectada. Tus datos locales no cambiaron.';
}

/** Botón «Sincronizar ahora». La primera vez muestra la vista previa en lugar de aplicar. */
export async function sincronizarAhora() {
  sync.fase = 'trabajando';
  sync.mensaje = 'Sincronizando…';
  try {
    const r = await sincronizador.sincronizar();
    if (r === 'sin-cuenta') {
      sync.fase = 'reposo';
      sync.mensaje = 'Conecta tu cuenta primero.';
    } else if (r === 'primera') {
      sync.plan = await sincronizador.previsualizar();
      sync.fase = 'vista-previa';
      sync.mensaje = '';
    } else {
      sync.cuenta = await leerCuenta();
      sync.fase = 'reposo';
      sync.mensaje = textoResumen(r);
    }
  } catch (e) {
    fallo(e);
  }
}

export async function confirmarVistaPrevia() {
  if (!sync.plan) return;
  sync.fase = 'trabajando';
  sync.mensaje = 'Sincronizando…';
  try {
    const r = await sincronizador.aplicar(sync.plan);
    sync.plan = null;
    sync.cuenta = await leerCuenta();
    sync.fase = 'reposo';
    sync.mensaje = textoResumen(r);
  } catch (e) {
    fallo(e);
  }
}

export function cancelarVistaPrevia() {
  sync.plan = null;
  sync.fase = 'reposo';
  sync.mensaje = 'No se cambió nada.';
}

/** Al abrir la app: solo si hay cuenta y ya hubo una primera sincronización confirmada. Nunca lanza. */
export async function sincronizarAlAbrir() {
  try {
    if (await estadoDatos()) return;
    await cargarCuenta();
    if (!sync.cuenta || sync.cuenta.ultimaSync === null) return;
    const r = await sincronizador.sincronizar();
    if (typeof r === 'object') {
      sync.cuenta = await leerCuenta();
      sync.mensaje = textoResumen(r);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.name : e);
  }
}

/** Avisa de que una serie cambió (estado o episodio visto). Nunca lanza ni espera. */
export function avisarCambio(aid: number) {
  try {
    sincronizador.avisarCambio(aid);
  } catch (e) {
    console.error(e);
  }
}
