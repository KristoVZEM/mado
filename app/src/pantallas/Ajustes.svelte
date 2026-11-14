<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { onMount } from 'svelte';
  import { asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { CATEGORIAS, categoriaPorDefecto, textoDeVersion, type CategoriaAjuste } from '../lib/ajustesCategorias.ts';
  import SeccionAnilist from './SeccionAnilist.svelte';
  import SeccionApariencia from './SeccionApariencia.svelte';
  import SeccionAvisos from './SeccionAvisos.svelte';
  import SeccionDatos from './SeccionDatos.svelte';
  import SeccionImportar from './SeccionImportar.svelte';
  import SeccionReproduccion from './SeccionReproduccion.svelte';
  import SeccionTmdb from './SeccionTmdb.svelte';

  let categoria = $state<CategoriaAjuste>(categoriaPorDefecto());

  // «0.1.0 · a1b2c3d»: qué compilación es la que está abierta.
  let version = $state('');

  onMount(() => {
    void asegurarAjustes();
    getVersion()
      .then((v) => (version = textoDeVersion(v, __COMMIT__)))
      .catch((e) => console.error('versión de la app:', e));
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
      {#if version}<p class="version">Mado {version}</p>{/if}
    </nav>

    <div class="panel">
      {#if categoria === 'reproduccion'}
        <SeccionReproduccion />
      {:else if categoria === 'apariencia'}
        <SeccionApariencia />
      {:else if categoria === 'avisos'}
        <SeccionAvisos />
      {:else if categoria === 'datos'}
        <SeccionDatos />
        <div class="formulario aparte"><SeccionImportar /></div>
      {:else}
        <h2>Cuentas</h2>
        <SeccionAnilist />
        <SeccionTmdb />
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
  .version {
    margin: 20px 0 0;
    padding: 0 12px;
    color: var(--texto-suave);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    user-select: text;
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
  /* Las secciones con texto y botones (Datos, Cuentas): espacios parejos entre párrafos, casillas y botones. */
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
  .aparte {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid var(--borde);
  }
  /* Encabezado de un grupo de filas dentro de una pestaña (las cuentas: AniList, TMDB). */
  .panel :global(.grupo) {
    margin: 32px 0 4px;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .panel :global(.grupo:first-of-type) {
    margin-top: 8px;
  }
  /* Recuadro de confirmación o vista previa dentro de una pestaña. */
  .panel :global(.confirmar) {
    margin: 4px 0 8px;
    padding: 14px 16px;
    border: 1px solid var(--borde-control);
    border-left: 3px solid var(--acento);
    border-radius: var(--radio);
    background: var(--superficie);
  }
  .panel :global(.confirmar p) {
    margin: 0 0 12px;
    overflow-wrap: anywhere;
  }
</style>
