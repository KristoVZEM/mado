<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { disable as quitarInicio, enable as ponerInicio, isEnabled as inicioPuesto } from '@tauri-apps/plugin-autostart';
  import { onMount } from 'svelte';
  import { ajustes, asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { guardarAjuste, leerAjuste } from '../lib/datos.ts';
  import { avisosActivos, enviarAviso } from '../lib/avisosApp.ts';
  import { ALCANCES_AVISOS, INTERVALOS_AVISOS, alcanceAvisosDe, intervaloAvisosDe } from '../lib/avisosAjustes.ts';

  let activo = $state(true);
  let intervalo = $state(intervaloAvisosDe(null));
  let alcance = $state(alcanceAvisosDe(null));
  let bandeja = $state(false);
  let inicio = $state(false);
  let mensaje = $state('');
  let falloAviso = $state(false);

  onMount(async () => {
    activo = await avisosActivos();
    intervalo = intervaloAvisosDe(await leerAjuste('avisos_intervalo').catch(() => null));
    alcance = alcanceAvisosDe(await leerAjuste('avisos_alcance').catch(() => null));
    await asegurarAjustes();
    bandeja = ajustes.cerrarABandeja;
    inicio = await inicioPuesto().catch(() => false);
  });

  // Seguir en la bandeja al cerrar. Al desactivarlo se quita también el inicio con Windows, que arranca oculto
  // y sin icono no habría forma de llegar a la ventana.
  async function cambiarBandeja(nuevo: boolean) {
    bandeja = nuevo;
    try {
      await guardarAjuste('cerrar_a_bandeja', nuevo ? '1' : '0');
      ajustes.cerrarABandeja = nuevo;
      await invoke('bandeja_visible', { visible: nuevo });
      if (!nuevo && inicio) await cambiarInicio(false);
      mensaje = '';
    } catch (e) {
      console.error(e);
      bandeja = !nuevo;
      falloAviso = true;
      mensaje = 'No se pudo guardar el ajuste.';
    }
  }

  async function cambiarInicio(nuevo: boolean) {
    inicio = nuevo;
    try {
      await (nuevo ? ponerInicio() : quitarInicio());
      mensaje = '';
    } catch (e) {
      console.error(e);
      inicio = !nuevo;
      falloAviso = true;
      mensaje = 'No se pudo cambiar el inicio con Windows.';
    }
  }

  /** Guarda un ajuste; si falla, deja el control como estaba y lo dice. */
  async function guardar(clave: string, valor: string, deshacer: () => void) {
    try {
      await guardarAjuste(clave, valor);
      mensaje = '';
    } catch (e) {
      console.error(e);
      deshacer();
      falloAviso = true;
      mensaje = 'No se pudo guardar el ajuste.';
    }
  }

  function cambiarActivo(nuevo: boolean) {
    activo = nuevo;
    void guardar('avisos_activos', nuevo ? '1' : '0', () => (activo = !nuevo));
  }

  function cambiarIntervalo(v: string) {
    const antes = intervalo;
    intervalo = Number(v);
    void guardar('avisos_intervalo', v, () => (intervalo = antes));
  }

  function cambiarAlcance(v: string) {
    const antes = alcance;
    alcance = Number(v);
    void guardar('avisos_alcance', v, () => (alcance = antes));
  }

  async function probar() {
    try {
      await enviarAviso({ titulo: 'Mado', cuerpo: 'Así se verán los avisos.' });
      falloAviso = false;
      mensaje = 'Aviso enviado.';
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      falloAviso = true;
      mensaje = 'No se pudo enviar el aviso. Revisa que las notificaciones de Windows estén activadas para Mado.';
    }
  }
</script>

<h2>Avisos</h2>

<FilaAjuste id="avisos-activos" titulo="Avisar cuando salga un episodio nuevo" ayuda={bandeja ? 'Con la app abierta o en la bandeja.' : 'Solo con la app abierta.'}>
  <input id="avisos-activos" type="checkbox" checked={activo} onchange={(e) => cambiarActivo(e.currentTarget.checked)} />
</FilaAjuste>

<FilaAjuste id="avisos-intervalo" titulo="Cada cuánto mirar" ayuda="Menos veces gasta menos red; más veces avisa antes. Vale desde la siguiente revisión.">
  <select id="avisos-intervalo" value={String(intervalo)} onchange={(e) => cambiarIntervalo(e.currentTarget.value)}>
    {#each INTERVALOS_AVISOS as i, n (i.minutos)}<option value={String(n)}>{i.nombre}</option>{/each}
  </select>
</FilaAjuste>

<FilaAjuste id="avisos-alcance" titulo="Series que se vigilan" ayuda="Solo se miran las que siguen en emisión y ya están vinculadas con AniList.">
  <select id="avisos-alcance" value={String(alcance)} onchange={(e) => cambiarAlcance(e.currentTarget.value)}>
    {#each ALCANCES_AVISOS as a, n (a.nombre)}<option value={String(n)}>{a.nombre}</option>{/each}
  </select>
</FilaAjuste>

<FilaAjuste
  id="bandeja"
  titulo="Seguir en la bandeja al cerrar"
  ayuda="Al cerrar la ventana, la app se queda junto al reloj y sigue avisando. Para salir de verdad: clic derecho en su icono y «Salir»."
>
  <input id="bandeja" type="checkbox" checked={bandeja} onchange={(e) => cambiarBandeja(e.currentTarget.checked)} />
</FilaAjuste>

<FilaAjuste
  id="inicio-windows"
  titulo="Abrir al iniciar Windows"
  ayuda={bandeja ? 'Arranca sin ventana, directamente en la bandeja.' : 'Necesita «Seguir en la bandeja al cerrar».'}
>
  <input id="inicio-windows" type="checkbox" checked={inicio} disabled={!bandeja} onchange={(e) => cambiarInicio(e.currentTarget.checked)} />
</FilaAjuste>

<div class="prueba">
  <button onclick={probar}>Probar aviso</button>
</div>
{#if mensaje}
  <p role={falloAviso ? 'alert' : 'status'} class:error={falloAviso}>{mensaje}</p>
{/if}

<style>
  .prueba {
    display: flex;
    justify-content: flex-end;
    padding: 12px 0 8px;
  }
</style>
