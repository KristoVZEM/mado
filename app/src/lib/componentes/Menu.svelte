<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Menú desplegable bajo un botón. Va dentro de un contenedor `position: relative` que también tiene el botón:
   * un clic en cualquier parte de ese contenedor no lo cierra. Esc o un clic fuera lo cierran.
   */
  let {
    abierto,
    etiqueta,
    alCerrar,
    arriba = false,
    derecha = false,
    children,
  }: {
    abierto: boolean;
    etiqueta: string;
    alCerrar: () => void;
    arriba?: boolean;
    derecha?: boolean;
    children: Snippet;
  } = $props();

  let caja = $state<HTMLElement | null>(null);

  $effect(() => {
    if (abierto && caja) caja.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  });

  function clicFuera(e: MouseEvent) {
    if (abierto && caja && !caja.parentElement?.contains(e.target as Node)) alCerrar();
  }

  function tecla(e: KeyboardEvent) {
    if (!abierto) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      alCerrar();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const botones = [...(caja?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
    if (botones.length === 0) return;
    e.preventDefault();
    const i = botones.indexOf(document.activeElement as HTMLElement);
    const siguiente = e.key === 'ArrowDown' ? (i + 1) % botones.length : (i - 1 + botones.length) % botones.length;
    botones[siguiente].focus();
  }
</script>

<svelte:window onclick={clicFuera} onkeydown={tecla} />

{#if abierto}
  <div class="menu" class:arriba class:derecha role="menu" aria-label={etiqueta} bind:this={caja}>
    {@render children()}
  </div>
{/if}

<style>
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 30;
    display: grid;
    min-width: 210px;
    padding: 4px;
    border: 1px solid var(--borde-control);
    border-radius: var(--radio-control);
    background: var(--superficie);
    box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.6);
  }
  .menu.derecha {
    left: auto;
    right: 0;
  }
  .menu.arriba {
    top: auto;
    bottom: calc(100% + 6px);
  }
  .menu :global(button) {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 6px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    text-align: left;
    font-weight: 400;
  }
  .menu :global(button:hover:not(:disabled)),
  .menu :global(button:focus-visible) {
    background: var(--relleno-hover);
  }
  .menu :global(.marca-menu) {
    width: 16px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .menu :global(hr) {
    width: 100%;
    margin: 4px 0;
    border: 0;
    border-top: 1px solid var(--borde);
  }
</style>
