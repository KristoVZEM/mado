<script lang="ts">
  import type { MediaAnilist } from '../datos.ts';

  let {
    candidatos,
    alElegir,
    alDescartar,
  }: { candidatos: MediaAnilist[]; alElegir: (m: MediaAnilist) => void; alDescartar: () => void } = $props();

  function detalle(m: MediaAnilist): string {
    return [m.anio, m.formato, m.episodios ? `${m.episodios} episodios` : null].filter(Boolean).join(' · ');
  }
</script>

<section class="elegir" aria-label="Elegir la obra de AniList">
  <p><strong>¿Es esta serie en AniList?</strong> Elige la correcta para ver sus datos.</p>
  <ul>
    {#each candidatos as m (m.anilistId)}
      <li>
        {#if m.portada}<img src={m.portada} alt="" loading="lazy" />{:else}<span class="sin-imagen"></span>{/if}
        <span class="texto">
          <strong>{m.tituloIngles ?? m.tituloRomaji}</strong>
          {#if m.tituloIngles && m.tituloIngles !== m.tituloRomaji}<span>{m.tituloRomaji}</span>{/if}
          <span>{detalle(m)}</span>
        </span>
        <button onclick={() => alElegir(m)}>Es esta</button>
      </li>
    {/each}
  </ul>
  <button onclick={alDescartar}>Ninguna de estas</button>
</section>

<style>
  .elegir {
    display: grid;
    gap: 8px;
    padding: 12px 16px;
    margin: 0 0 20px;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-radius: var(--radio);
  }
  p {
    margin: 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  img,
  .sin-imagen {
    width: 44px;
    height: 64px;
    object-fit: cover;
    border-radius: 4px;
    background: var(--superficie-2);
    flex: none;
  }
  .texto {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .texto span {
    color: var(--texto-suave);
  }
  .elegir > button {
    justify-self: start;
  }
</style>
