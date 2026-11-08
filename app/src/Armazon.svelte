<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CARRIL, type Seccion } from './lib/carril.ts';
  import { irASeccion, nav } from './lib/navegacion.svelte.ts';

  let { children }: { children: Snippet } = $props();

  // Iconos de 24×24 trazados con línea.
  const ICONOS: Record<Seccion, string> = {
    inicio: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    catalogo: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
    biblioteca: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
    historial: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    ajustes:
      'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  };
</script>

<div class="armazon">
  <nav class="carril" aria-label="Secciones">
    {#each CARRIL as e (e.id)}
      <button
        class="elemento"
        class:abajo={e.id === 'ajustes'}
        aria-label={e.nombre}
        title={e.nombre}
        aria-current={nav.seccion === e.id ? 'page' : undefined}
        onclick={() => irASeccion(e.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONOS[e.id]} /></svg>
      </button>
    {/each}
  </nav>
  <div class="contenido">{@render children()}</div>
</div>

<style>
  .armazon {
    display: grid;
    grid-template-columns: 64px 1fr;
    min-height: 100vh;
    background: var(--fondo);
  }
  .carril {
    position: sticky;
    top: 0;
    height: 100vh;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 0;
    background: var(--superficie);
    border-right: 1px solid var(--borde);
  }
  .elemento {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--texto-suave);
  }
  .elemento.abajo {
    margin-top: auto;
  }
  .elemento:hover:not(:disabled) {
    background: var(--superficie-2);
    color: var(--texto);
  }
  .elemento[aria-current='page'] {
    color: var(--acento);
    background: var(--superficie-2);
  }
  .elemento:focus-visible {
    outline: 2px solid var(--acento);
  }
  svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .contenido {
    min-width: 0;
  }
</style>
