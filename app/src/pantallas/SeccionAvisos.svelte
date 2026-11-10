<script lang="ts">
  import { onMount } from 'svelte';
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { guardarAjuste, leerAjuste } from '../lib/datos.ts';
  import { avisosActivos, enviarAviso } from '../lib/avisosApp.ts';
  import { ALCANCES_AVISOS, INTERVALOS_AVISOS, alcanceAvisosDe, intervaloAvisosDe } from '../lib/avisosAjustes.ts';

  let activo = $state(true);
  let intervalo = $state(intervaloAvisosDe(null));
  let alcance = $state(alcanceAvisosDe(null));
  let mensaje = $state('');
  let falloAviso = $state(false);

  onMount(async () => {
    activo = await avisosActivos();
    intervalo = intervaloAvisosDe(await leerAjuste('avisos_intervalo').catch(() => null));
    alcance = alcanceAvisosDe(await leerAjuste('avisos_alcance').catch(() => null));
  });

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
      await enviarAviso({ titulo: 'Ukiku', cuerpo: 'Así se verán los avisos.' });
      falloAviso = false;
      mensaje = 'Aviso enviado.';
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      falloAviso = true;
      mensaje = 'No se pudo enviar el aviso. Revisa que las notificaciones de Windows estén activadas para Ukiku.';
    }
  }
</script>

<h2>Avisos</h2>

<FilaAjuste id="avisos-activos" titulo="Avisar cuando salga un episodio nuevo" ayuda="Solo con la app abierta.">
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
