<script lang="ts">
  import { onMount } from 'svelte';
  import { asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { CATEGORIAS, categoriaPorDefecto, type CategoriaAjuste } from '../lib/ajustesCategorias.ts';
  import SeccionAnilist from './SeccionAnilist.svelte';
  import SeccionApariencia from './SeccionApariencia.svelte';
  import SeccionAvisos from './SeccionAvisos.svelte';
  import SeccionImportar from './SeccionImportar.svelte';
  import SeccionReproduccion from './SeccionReproduccion.svelte';
  import SeccionTmdb from './SeccionTmdb.svelte';

  let categoria = $state<CategoriaAjuste>(categoriaPorDefecto());

  onMount(() => {
    void asegurarAjustes();
  });
</script>

<main class="pantalla">
  <h1>Ajustes</h1>
  <div class="disposicion">
    <nav class="lateral" aria-label="Categorías de ajustes">
      {#each CATEGORIAS as c (c.id)}
        <button
          class="categoria"
          class:activa={categoria === c.id}
          aria-current={categoria === c.id ? 'page' : undefined}
          onclick={() => (categoria = c.id)}
        >
          {c.nombre}
        </button>
      {/each}
    </nav>

    <div class="panel">
      {#if categoria === 'reproduccion'}
        <SeccionReproduccion />
      {:else if categoria === 'apariencia'}
        <SeccionApariencia />
      {:else if categoria === 'avisos'}
        <h2>Avisos</h2>
        <div class="formulario"><SeccionAvisos /></div>
      {:else if categoria === 'datos'}
        <h2>Datos</h2>
        <div class="formulario"><SeccionImportar /></div>
      {:else}
        <h2>Cuentas</h2>
        <section class="bloque formulario" aria-label="Cuenta de AniList"><SeccionAnilist /></section>
        <section class="bloque formulario" aria-label="Imágenes de TMDB"><SeccionTmdb /></section>
      {/if}
    </div>
  </div>
</main>

<style>
  .disposicion {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 32px;
    max-width: 960px;
  }
  .lateral {
    display: grid;
    align-content: start;
    gap: 2px;
  }
  .categoria {
    min-height: 38px;
    border-color: transparent;
    background: none;
    text-align: left;
    color: var(--texto-suave);
  }
  .categoria:hover:not(:disabled) {
    color: var(--texto);
  }
  .categoria.activa {
    background: var(--boton-claro);
    border-color: var(--boton-claro);
    color: var(--boton-claro-texto);
    font-weight: 600;
  }
  .categoria.activa:hover:not(:disabled) {
    background: var(--boton-claro-hover);
    color: var(--boton-claro-texto);
  }
  .panel {
    max-width: 720px;
  }
  .panel :global(h2) {
    margin-top: 0;
  }
  .panel :global(h3) {
    margin: 0 0 12px;
    font-size: 1.15rem;
  }
  /* Las secciones con texto y botones (Avisos, Datos, Cuentas): espacios parejos entre párrafos, casillas y botones. */
  .formulario :global(p),
  .formulario :global(ol),
  .formulario :global(ul) {
    margin: 0 0 14px;
  }
  .formulario :global(ol),
  .formulario :global(ul) {
    padding-left: 20px;
  }
  .formulario :global(li) {
    margin-bottom: 6px;
  }
  .formulario :global(label) {
    display: grid;
    gap: 6px;
    max-width: 420px;
    margin: 0 0 14px;
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .formulario :global(label input) {
    color: var(--texto);
    font-size: 1rem;
  }
  .formulario :global(label:has(input[type='checkbox'])) {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: none;
    color: var(--texto);
    font-size: 1rem;
  }
  .formulario :global(.acciones) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px;
  }
  .formulario :global(input[aria-invalid='true']) {
    outline: 2px solid #e53935;
  }
  .bloque {
    margin-bottom: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--borde);
  }
  .bloque:last-child {
    border-bottom: 0;
  }
</style>
