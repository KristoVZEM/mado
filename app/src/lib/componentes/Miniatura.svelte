<script lang="ts">
  import Portada from './Portada.svelte';

  /**
   * Captura de un episodio con barra de progreso pegada abajo, círculo de reproducir y anillo al pasar el ratón.
   * Va siempre dentro de un botón: el hover y el foco son los del botón.
   */
  let {
    aid,
    titulo,
    numero,
    progreso = null,
    imagen,
  }: { aid: number; titulo: string; numero: number; progreso?: number | null; imagen?: string | null } = $props();
  /** Con `imagen` (o `imagen: null` si la serie no tiene banner) se ve la serie en vez del episodio. */
  const deSerie = $derived(imagen !== undefined);
</script>

<span class="miniatura">
  {#if deSerie}
    <Portada {aid} {titulo} apaisada preferida={imagen} />
  {:else}
    <Portada {aid} {titulo} {numero} />
  {/if}
  <span class="reproducir" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>
  </span>
  {#if progreso !== null}<progress value={progreso} max="1" aria-hidden="true"></progress>{/if}
  <span class="contorno"></span>
</span>

<style>
  .miniatura {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: var(--radio);
  }
  .miniatura :global(img) {
    transition:
      opacity 300ms ease-out,
      transform 300ms ease-out;
  }
  :global(button:hover) .miniatura :global(img),
  :global(button:focus-visible) .miniatura :global(img) {
    opacity: 0.75;
    transform: scale(1.05);
  }
  .contorno {
    position: absolute;
    inset: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    pointer-events: none;
    transition: box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  :global(button:hover) .contorno,
  :global(button:focus-visible) .contorno {
    box-shadow: inset 0 0 0 1px rgb(250 250 250 / 0.15);
  }
  .reproducir {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    place-items: center;
    padding: 16px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    opacity: 0;
    transform: translate(-50%, -50%);
    transition: opacity 150ms;
    pointer-events: none;
  }
  .reproducir svg {
    width: 24px;
    height: 24px;
    fill: #fff;
  }
  :global(button:hover) .reproducir,
  :global(button:focus-visible) .reproducir {
    opacity: 1;
    background: rgb(0 0 0 / 0.75);
  }
  progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 4px;
    appearance: none;
    border: 0;
    background: #364153;
  }
  progress::-webkit-progress-bar {
    background: #364153;
  }
  progress::-webkit-progress-value {
    background: var(--acento);
  }
  @media (prefers-reduced-motion: reduce) {
    .miniatura :global(img),
    .contorno,
    .reproducir {
      transition: none;
    }
    :global(button:hover) .miniatura :global(img),
    :global(button:focus-visible) .miniatura :global(img) {
      transform: none;
    }
  }
</style>
