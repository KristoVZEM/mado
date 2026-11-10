<script lang="ts">
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { onMount } from 'svelte';
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { ajustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { carpetaRespaldos, exportarCopia, guardarAjuste, leerAjuste, limpiarCacheTmdb, restaurarCopia } from '../lib/datos.ts';
  import { AUTO_RESPALDOS, ESPERAS_CONEXION, autoRespaldoDe, nombreCopia } from '../lib/datosAjustes.ts';
  import { textoDeError } from '../lib/errores.ts';

  let autoRespaldo = $state(0);
  let carpeta = $state('');
  /** `true` si la carpeta de las copias la eligió el usuario (no es la de por defecto). */
  let carpetaElegida = $state(false);
  /** Copia elegida para restaurar, a la espera de confirmar. */
  let porRestaurar = $state<string | null>(null);
  let mensaje = $state('');
  let falloMensaje = $state(false);
  let ocupado = $state(false);

  onMount(async () => {
    autoRespaldo = autoRespaldoDe(await leerAjuste('auto_respaldo').catch(() => null));
    await cargarCarpeta();
  });

  async function cargarCarpeta() {
    carpetaElegida = ((await leerAjuste('carpeta_respaldos').catch(() => '')) ?? '') !== '';
    carpeta = await carpetaRespaldos().catch(() => '');
  }

  function avisar(texto: string, fallo = false) {
    mensaje = texto;
    falloMensaje = fallo;
  }

  async function exportar() {
    ocupado = true;
    avisar('');
    try {
      const ruta = await save({
        defaultPath: nombreCopia(Date.now()),
        filters: [{ name: 'Base de datos de ukiku-pc', extensions: ['db'] }],
      });
      if (ruta === null) return; // canceló
      await exportarCopia(ruta);
      avisar(`Copia guardada en ${ruta}`);
    } catch (e) {
      console.error(e);
      avisar(`No se pudo guardar la copia. ${textoDeError(e)}`, true);
    } finally {
      ocupado = false;
    }
  }

  async function elegirCarpeta() {
    try {
      const ruta = await open({ directory: true, defaultPath: carpeta || undefined, title: 'Carpeta de las copias automáticas' });
      if (typeof ruta !== 'string') return;
      await guardarAjuste('carpeta_respaldos', ruta);
      await cargarCarpeta();
      avisar(`Las copias automáticas irán a ${ruta}`);
    } catch (e) {
      console.error(e);
      avisar(`No se pudo cambiar la carpeta. ${textoDeError(e)}`, true);
    }
  }

  async function carpetaPorDefecto() {
    try {
      await guardarAjuste('carpeta_respaldos', '');
      await cargarCarpeta();
      avisar('Las copias automáticas vuelven a la carpeta de la app.');
    } catch (e) {
      console.error(e);
      avisar(`No se pudo cambiar la carpeta. ${textoDeError(e)}`, true);
    }
  }

  async function elegirCopia() {
    avisar('');
    try {
      const ruta = await open({
        defaultPath: carpeta || undefined,
        title: 'Elige la copia que quieres restaurar',
        filters: [{ name: 'Base de datos de ukiku-pc', extensions: ['db'] }],
      });
      if (typeof ruta === 'string') porRestaurar = ruta;
    } catch (e) {
      console.error(e);
      avisar(`No se pudo abrir el selector. ${textoDeError(e)}`, true);
    }
  }

  async function restaurar() {
    const ruta = porRestaurar;
    if (ruta === null) return;
    ocupado = true;
    try {
      await restaurarCopia(ruta);
      porRestaurar = null;
      avisar('Copia restaurada. La app se recarga para mostrar los datos nuevos…');
      // Todo lo que la pantalla tenía en memoria es de los datos de antes: se recarga entera.
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      console.error(e);
      porRestaurar = null;
      avisar(`No se pudo restaurar; tus datos siguen como estaban. ${textoDeError(e)}`, true);
    } finally {
      ocupado = false;
    }
  }

  function cambiarAutoRespaldo(v: string) {
    autoRespaldo = Number(v);
    guardarAjusteSilencioso('auto_respaldo', v);
  }

  async function limpiarTmdb() {
    ocupado = true;
    avisar('');
    try {
      const n = await limpiarCacheTmdb();
      avisar(n === 0 ? 'No había nada guardado.' : `Listo: se borraron los logos y fondos de ${n} ${n === 1 ? 'serie' : 'series'}.`);
    } catch (e) {
      console.error(e);
      avisar(`No se pudo limpiar. ${textoDeError(e)}`, true);
    } finally {
      ocupado = false;
    }
  }

  function cambiarEspera(v: string) {
    ajustes.espera = Number(v);
    guardarAjusteSilencioso('espera_conexion', v);
  }
</script>

<h2>Datos y red</h2>

<FilaAjuste id="exportar" titulo="Exportar una copia de tus datos" ayuda="Guarda tu historial, favoritos y ajustes en un archivo .db que eliges tú.">
  <button id="exportar" onclick={exportar} disabled={ocupado}>Exportar…</button>
</FilaAjuste>

<FilaAjuste
  id="auto-respaldo"
  titulo="Copia automática"
  ayuda="Se hace al abrir la app y se conservan las 5 últimas."
>
  <select id="auto-respaldo" value={String(autoRespaldo)} onchange={(e) => cambiarAutoRespaldo(e.currentTarget.value)}>
    {#each AUTO_RESPALDOS as a, i (a.dias)}<option value={String(i)}>{a.nombre}</option>{/each}
  </select>
</FilaAjuste>

<FilaAjuste id="carpeta-copias" titulo="Carpeta de las copias automáticas" ayuda={carpeta || 'Carpeta de la app'}>
  <button id="carpeta-copias" onclick={elegirCarpeta}>Cambiar…</button>
  {#if carpetaElegida}<button onclick={carpetaPorDefecto}>Por defecto</button>{/if}
</FilaAjuste>

<FilaAjuste
  id="restaurar"
  titulo="Restaurar una copia"
  ayuda="Sustituye todos tus datos por los de una copia (.db). Antes se guardan los actuales, por si te arrepientes."
>
  <button id="restaurar" onclick={elegirCopia} disabled={ocupado || porRestaurar !== null}>Elegir copia…</button>
</FilaAjuste>

{#if porRestaurar !== null}
  <div class="confirmar" role="alertdialog" aria-label="Confirmar la restauración">
    <p>
      Vas a sustituir <strong>todos tus datos actuales</strong> (historial, favoritos, progreso, ajustes) por los de
      <code>{porRestaurar}</code>. Los de ahora se guardan antes en <code>antes-de-restaurar.db</code>, en la carpeta
      <code>copias</code> de la app.
    </p>
    <div class="acciones">
      <button class="principal" onclick={restaurar} disabled={ocupado}>Sí, restaurar</button>
      <button onclick={() => (porRestaurar = null)} disabled={ocupado}>Cancelar</button>
    </div>
  </div>
{/if}

<FilaAjuste id="limpiar-tmdb" titulo="Limpiar las imágenes de TMDB guardadas" ayuda="Borra los logos y fondos guardados; se vuelven a pedir al abrir cada serie.">
  <button id="limpiar-tmdb" onclick={limpiarTmdb} disabled={ocupado}>Limpiar</button>
</FilaAjuste>

<FilaAjuste id="espera" titulo="Espera de conexión" ayuda="Cuánto se espera la respuesta de la fuente antes de darla por caída. Con una conexión lenta, sube el tiempo.">
  <select id="espera" value={String(ajustes.espera)} onchange={(e) => cambiarEspera(e.currentTarget.value)}>
    {#each ESPERAS_CONEXION as e, i (e.segundos)}<option value={String(i)}>{e.nombre}</option>{/each}
  </select>
</FilaAjuste>

{#if mensaje}
  <p class="mensaje" role={falloMensaje ? 'alert' : 'status'} class:error={falloMensaje}>{mensaje}</p>
{/if}

<style>
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mensaje {
    margin: 12px 0 0;
    overflow-wrap: anywhere;
  }
</style>
