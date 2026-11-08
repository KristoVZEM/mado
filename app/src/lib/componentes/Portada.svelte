<script lang="ts">
  import { inicialDe, urlCaptura, urlPortada } from '../imagenes.ts';

  let { aid, titulo, numero }: { aid: number; titulo: string; numero?: number } = $props();

  const captura = $derived(numero !== undefined);
  const src = $derived(numero !== undefined ? urlCaptura(aid, numero) : urlPortada(aid));
  let fallida = $state<string | null>(null);
  const roto = $derived(src === null || fallida === src);
</script>

<div class="portada" class:captura>
  {#if !roto && src}
    <img {src} alt="" loading="lazy" onerror={() => (fallida = src)} />
  {:else}
    <span class="inicial" aria-hidden="true">{inicialDe(titulo)}</span>
  {/if}
</div>

<style>
  .portada {
    aspect-ratio: 2 / 3;
    border-radius: var(--radio);
    background: var(--superficie-2);
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  .portada.captura {
    aspect-ratio: 16 / 9;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .inicial {
    font-size: 2.2rem;
    color: var(--texto-suave);
  }
</style>
