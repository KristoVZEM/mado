<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Fila de tarjetas con desplazamiento. Con `titulo`, el título y las flechas van en una cabecera sobre la fila y
   * la pista llega hasta el borde derecho de la ventana (las tarjetas se cortan ahí, señal de que hay más). Sin
   * `titulo`, las flechas salen sobre las tarjetas al pasar el ratón.
   */
  let {
    etiqueta,
    titulo,
    verTodo,
    children,
  }: { etiqueta: string; titulo?: string; verTodo?: { texto: string; alPulsar: () => void }; children: Snippet } = $props();

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

{#if titulo}
  <div class="cabecera-fila">
    <h2>{titulo}</h2>
    {#if verTodo}<button class="enlace ver-todo" onclick={verTodo.alPulsar}>{verTodo.texto} ›</button>{/if}
    <div class="flechas-cabecera">
      <button class="flecha-cab" aria-label={`${etiqueta}: anteriores`} disabled={alInicio} onclick={() => mover(-1)}>‹</button>
      <button class="flecha-cab" aria-label={`${etiqueta}: siguientes`} disabled={alFinal} onclick={() => mover(1)}>›</button>
    </div>
  </div>
{/if}

<div class="envoltura" class:con-cabecera={!!titulo}>
  {#if !titulo}
    <button class="flecha izquierda" aria-label={`${etiqueta}: anteriores`} disabled={alInicio} onclick={() => mover(-1)}>
      ‹
    </button>
  {/if}
  <ul class="pista" bind:this={pista} onscroll={medir}>
    {@render children()}
  </ul>
  {#if !titulo}
    <button class="flecha derecha" aria-label={`${etiqueta}: siguientes`} disabled={alFinal} onclick={() => mover(1)}>
      ›
    </button>
  {/if}
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
    gap: var(--espacio);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .pista::-webkit-scrollbar {
    display: none;
  }
  /* Con cabecera, sin relleno a la derecha: la última tarjeta visible se corta contra el borde de la ventana. */
  .con-cabecera .pista {
    margin-right: calc(-1 * var(--margen));
  }
  .cabecera-fila {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 12px;
  }
  .cabecera-fila h2 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .flechas-cabecera {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .ver-todo {
    font-size: 0.875rem;
  }
  .flecha-cab {
    width: 36px;
    padding: 0;
    font-size: 1.4rem;
    line-height: 1;
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
    background: rgb(10 10 10 / 0.75);
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
