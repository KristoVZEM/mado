<script lang="ts">
  import type { RelacionAnilist } from '../datos.ts';
  import { nombreRelacion } from '../relaciones.ts';

  // Series relacionadas de la Ficha (precuelas, secuelas…), con el póster de AniList.
  let { relaciones, alAbrir }: { relaciones: RelacionAnilist[]; alAbrir: (r: RelacionAnilist) => void } = $props();
</script>

<section class="relacionadas" aria-label="Relacionadas">
  <h2>Relacionadas</h2>
  <ul class="tarjetas-rel">
    {#each relaciones as r (r.anilistId)}
      <li>
        <button class="rel" onclick={() => alAbrir(r)}>
          <span class="rel-marco">
            <span class="rel-inicial" aria-hidden="true">{r.titulo.trim().charAt(0).toUpperCase()}</span>
            {#if r.portada}
              <img src={r.portada} alt="" loading="lazy" onerror={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = 'none')} />
            {/if}
            <span class="rel-contorno"></span>
          </span>
          <strong>{r.titulo}</strong>
          <span class="rel-tipo">{nombreRelacion(r.tipo)}</span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  :global(.capa) h2 {
    margin: 0;
    font-size: 1.875rem;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: normal;
  }
  .tarjetas-rel {
    display: flex;
    flex-wrap: wrap;
    gap: 20px 16px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
  }
  .rel {
    display: grid;
    gap: 6px;
    width: 150px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    align-content: start;
  }
  .rel:hover:not(:disabled) {
    background: none;
  }
  .rel-marco {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 2 / 3;
    overflow: hidden;
    border-radius: var(--radio);
    background: var(--superficie-2);
  }
  .rel-marco img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 300ms ease-out, transform 300ms ease-out;
  }
  .rel:hover .rel-marco img,
  .rel:focus-visible .rel-marco img {
    opacity: 0.8;
    transform: scale(1.05);
  }
  .rel-inicial {
    color: var(--texto-suave);
    font-size: 2rem;
  }
  .rel-contorno {
    position: absolute;
    inset: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    pointer-events: none;
  }
  .rel strong {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .rel-tipo {
    color: var(--texto-suave);
    font-size: 0.8rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .rel-marco img {
      transition: none;
    }
    .rel:hover .rel-marco img,
    .rel:focus-visible .rel-marco img {
      transform: none;
    }
  }
</style>
