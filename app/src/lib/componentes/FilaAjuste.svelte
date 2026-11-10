<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Una fila de ajuste: título y ayuda a la izquierda, el control a la derecha. */
  let { titulo, ayuda, id, children }: { titulo: string; ayuda?: string; id: string; children: Snippet } = $props();
</script>

<div class="fila">
  <div class="texto">
    <label for={id} class="titulo">{titulo}</label>
    {#if ayuda}<p class="ayuda" id="{id}-ayuda">{ayuda}</p>{/if}
  </div>
  <div class="control">{@render children()}</div>
</div>

<style>
  .fila {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 14px 0;
    border-bottom: 1px solid var(--borde);
  }
  .fila:last-child {
    border-bottom: 0;
  }
  .texto {
    min-width: 0;
  }
  .titulo {
    display: block;
    font-weight: 600;
  }
  .ayuda {
    margin: 2px 0 0;
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .control {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
