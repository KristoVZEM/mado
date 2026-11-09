<script lang="ts">
  import { onMount } from 'svelte';
  import { guardarAjuste } from '../lib/datos.ts';
  import { avisosActivos, enviarAviso } from '../lib/avisosApp.ts';

  let activo = $state(true);
  let mensaje = $state('');
  let falloAviso = $state(false);

  onMount(async () => {
    activo = await avisosActivos();
  });

  async function cambiar() {
    try {
      await guardarAjuste('avisos_activos', activo ? '1' : '0');
    } catch (e) {
      console.error(e);
      activo = !activo;
      falloAviso = true;
      mensaje = 'No se pudo guardar el ajuste.';
    }
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

<h3>Avisos de episodios nuevos</h3>
<p>Solo con la app abierta. Se revisa cada 30 minutos lo que estás viendo y sigue en emisión.</p>
<label>
  <input type="checkbox" bind:checked={activo} onchange={cambiar} />
  Avisar cuando salga un episodio nuevo
</label>
<div class="acciones">
  <button onclick={probar}>Probar aviso</button>
</div>
{#if mensaje}
  <p role={falloAviso ? 'alert' : 'status'} class:error={falloAviso}>{mensaje}</p>
{/if}
