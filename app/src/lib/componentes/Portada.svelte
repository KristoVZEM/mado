<script lang="ts">
  import { inicialDe, urlCaptura, urlPortada } from '../imagenes.ts';

  /** `preferida`: una portada mejor que la de la CDN (por ejemplo la grande de AniList); si falla, se usa la de la CDN. */
  let { aid, titulo, numero, preferida = null }: { aid: number; titulo: string; numero?: number; preferida?: string | null } = $props();

  const captura = $derived(numero !== undefined);
  const principal = $derived(numero !== undefined ? urlCaptura(aid, numero) : (preferida ?? urlPortada(aid)));
  /** Si la captura de un episodio no carga, se enseña el póster de la serie antes que una letra. */
  const respaldo = $derived(numero !== undefined || preferida ? urlPortada(aid) : null);
  let fallidas = $state<string[]>([]);
  const src = $derived([principal, respaldo].find((s) => s !== null && !fallidas.includes(s)) ?? null);
</script>

<div class="portada" class:captura>
  {#if src}
    <img {src} class:respaldo={src === respaldo} alt="" loading="lazy" onerror={() => (fallidas = [...fallidas, src])} />
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
  /* El póster es vertical: en un recuadro 16:9 se recorta, y la parte alta suele tener las caras. */
  img.respaldo {
    object-position: center 25%;
  }
  .inicial {
    font-size: 2.2rem;
    color: var(--texto-suave);
  }
</style>
