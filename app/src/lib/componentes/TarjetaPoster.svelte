<script lang="ts">
  import Portada from './Portada.svelte';

  let {
    aid,
    titulo,
    subtitulo,
    etiqueta,
    alAbrir,
  }: { aid: number; titulo: string; subtitulo?: string; etiqueta?: string; alAbrir: () => void } = $props();
</script>

<button class="tarjeta" onclick={alAbrir}>
  <span class="marco">
    <Portada {aid} {titulo} />
    {#if etiqueta}<span class="pastilla">{etiqueta}</span>{/if}
  </span>
  <strong>{titulo}</strong>
  {#if subtitulo}<span>{subtitulo}</span>{/if}
</button>

<style>
  .tarjeta {
    display: grid;
    gap: 6px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .tarjeta:hover:not(:disabled) {
    background: none;
  }
  .tarjeta:hover :global(.portada),
  .tarjeta:focus-visible :global(.portada) {
    outline: 2px solid var(--anillo);
  }
  .marco {
    position: relative;
    display: block;
  }
  .pastilla {
    position: absolute;
    top: 6px;
    left: 6px;
    max-width: calc(100% - 12px);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--acento);
    color: var(--sobre-acento);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.3;
  }
  strong {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  span {
    color: var(--texto-suave);
    font-size: 0.9em;
  }
</style>
