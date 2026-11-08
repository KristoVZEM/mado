<script lang="ts">
  import Portada from './Portada.svelte';

  let {
    aid,
    titulo,
    subtitulo,
    alAbrir,
  }: { aid: number; titulo: string; subtitulo?: string; alAbrir: () => void } = $props();
</script>

<button class="tarjeta" onclick={alAbrir}>
  <Portada {aid} {titulo} />
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
    outline: 2px solid var(--acento);
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
