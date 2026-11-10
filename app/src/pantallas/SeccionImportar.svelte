<script lang="ts">
  import { onMount } from 'svelte';
  import { estadoDatos } from '../lib/datos.ts';
  import { cancelar, confirmar, elegirCarpeta, importacion, importar } from '../lib/importacion.svelte.ts';
  import { lineasResumen, textoAviso } from '../lib/importar.ts';

  let datosOk = $state(false);

  onMount(async () => {
    datosOk = (await estadoDatos().catch(() => 'error')) === null;
  });

  // El estado de la importación vive en su propio módulo: sobrevive a cerrar y reabrir Ajustes.
  const fase = $derived(importacion.fase);
</script>

<h3>Importar copia de Ukiku</h3>
{#if !datosOk}
  <p class="error">Los datos locales no están disponibles; no se puede importar.</p>
{:else if fase.tipo === 'inicio' || fase.tipo === 'error' || fase.tipo === 'listo'}
  <p>
    Elige la carpeta de tu copia de seguridad de Ukiku (local o de Dropbox). Solo se leen los archivos
    <code>history</code>, <code>following</code> y <code>favs</code>.
  </p>
  <button onclick={elegirCarpeta}>Elegir carpeta…</button>
  {#if fase.tipo === 'error'}<p class="error" role="alert">{fase.texto}</p>{/if}
  {#if fase.tipo === 'listo'}<p role="status">{fase.texto}</p>{/if}
{:else if fase.tipo === 'vista'}
  <ul class="resumen">
    {#each lineasResumen(fase.resumen) as linea}<li>{linea}</li>{/each}
  </ul>
  {#if fase.confirmando}
    <p class="error" role="alert">{textoAviso('reemplazar', fase.resumen)}</p>
    <div class="acciones">
      <button onclick={() => importar('reemplazar')}>Sí, reemplazar</button>
      <button onclick={() => confirmar(false)}>Cancelar</button>
    </div>
  {:else}
    <p>{textoAviso('mezclar', fase.resumen)}</p>
    <div class="acciones">
      <button onclick={() => importar('mezclar')}>Mezclar</button>
      <button onclick={() => confirmar(true)}>Reemplazar…</button>
      <button onclick={cancelar}>Cancelar</button>
    </div>
  {/if}
{:else}
  <p>Importando…</p>
{/if}

<style>
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .resumen {
    margin: 0;
    padding-left: 18px;
  }
</style>
