<script lang="ts">
  import type { Snippet } from 'svelte';

  let { etiqueta, children }: { etiqueta: string; children: Snippet } = $props();

  let pista = $state<HTMLUListElement>();
  let alInicio = $state(true);
  let alFinal = $state(true);

  function medir() {
    if (!pista) return;
    alInicio = pista.scrollLeft <= 1;
    alFinal = pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 1;
  }

  /** Avanza casi una pantalla de la fila, como las filas de Netflix. */
  function mover(sentido: -1 | 1) {
    pista?.scrollBy({ left: sentido * pista.clientWidth * 0.9, behavior: 'smooth' });
  }

  $effect(() => {
    if (!pista) return;
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(pista);
    return () => observador.disconnect();
  });
</script>

<div class="envoltura">
  <button class="flecha izquierda" aria-label={`${etiqueta}: anteriores`} disabled={alInicio} onclick={() => mover(-1)}>
    ‹
  </button>
  <ul class="pista" bind:this={pista} onscroll={medir}>
    {@render children()}
  </ul>
  <button class="flecha derecha" aria-label={`${etiqueta}: siguientes`} disabled={alFinal} onclick={() => mover(1)}>
    ›
  </button>
</div>

<style>
  .envoltura {
    position: relative;
  }
  .pista {
    list-style: none;
    margin: 0;
    padding: 0 0 8px;
    display: flex;
    gap: 16px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pista::-webkit-scrollbar {
    display: none;
  }
  .flecha {
    position: absolute;
    top: 0;
    bottom: 8px;
    z-index: 1;
    width: 40px;
    padding: 0;
    border: 0;
    border-radius: var(--radio);
    background: rgb(14 14 19 / 0.75);
    font-size: 2rem;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .izquierda {
    left: 0;
  }
  .derecha {
    right: 0;
  }
  .envoltura:hover .flecha:not(:disabled),
  .flecha:focus-visible {
    opacity: 1;
  }
  .flecha:disabled {
    opacity: 0;
    pointer-events: none;
  }
</style>
