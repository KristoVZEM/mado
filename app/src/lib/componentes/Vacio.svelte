<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Estado vacío: qué pasa, por qué y, si hay, qué hacer (las acciones van como contenido). */
  let { titulo, texto, children }: { titulo: string; texto: string; children?: Snippet } = $props();
</script>

<section class="vacio">
  <h2>{titulo}</h2>
  <p>{texto}</p>
  {#if children}<p class="acciones">{@render children()}</p>{/if}
</section>

<style>
  .vacio {
    max-width: 52ch;
    margin: 40px 0;
  }
  .vacio h2 {
    margin-top: 0;
  }
  .vacio p {
    color: var(--texto-suave);
  }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
