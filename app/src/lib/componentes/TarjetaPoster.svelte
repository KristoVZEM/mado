<script lang="ts">
  import type { Snippet } from 'svelte';
  import Portada from './Portada.svelte';

  let {
    aid,
    titulo,
    subtitulo,
    etiqueta,
    alAbrir,
    progreso = null,
    favorito = false,
    acciones,
    alMenuContextual,
  }: {
    aid: number;
    titulo: string;
    subtitulo?: string;
    etiqueta?: string;
    alAbrir: () => void;
    /** Parte vista (0-1): barra al pie del póster. */
    progreso?: number | null;
    favorito?: boolean;
    /** Botones sobre la esquina del póster (el «⋯» de la Biblioteca). Van fuera del botón de la tarjeta. */
    acciones?: Snippet;
    /** Clic derecho, tecla Menú o Shift+F10 sobre la tarjeta. */
    alMenuContextual?: () => void;
  } = $props();

  function contextual(e: Event) {
    if (!alMenuContextual) return;
    e.preventDefault();
    alMenuContextual();
  }

  function tecla(e: KeyboardEvent) {
    if (alMenuContextual && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) contextual(e);
  }
</script>

<div class="envoltura">
  <button class="tarjeta" onclick={alAbrir} oncontextmenu={contextual} onkeydown={tecla}>
    <span class="marco">
      <Portada {aid} {titulo} />
      {#if etiqueta}<span class="pastilla">{etiqueta}</span>{/if}
      {#if favorito}<span class="estrella" aria-hidden="true">★</span>{/if}
      {#if progreso !== null && progreso > 0}
        <span class="barra" aria-hidden="true"><span style:width={`${Math.round(progreso * 100)}%`}></span></span>
      {/if}
      <span class="contorno"></span>
    </span>
    <strong>{titulo}</strong>
    {#if subtitulo}<span>{subtitulo}</span>{/if}
    {#if favorito}<span class="solo-lectores">Favorita</span>{/if}
  </button>
  {#if acciones}<div class="acciones">{@render acciones()}</div>{/if}
</div>

<style>
  .envoltura {
    position: relative;
  }
  .acciones {
    position: absolute;
    top: 6px;
    right: 6px;
    opacity: 0;
    transition: opacity 150ms;
  }
  /* Visible con el ratón, con el foco dentro o con su menú abierto. */
  .envoltura:hover .acciones,
  .envoltura:focus-within .acciones,
  .acciones:has(:global([aria-expanded='true'])) {
    opacity: 1;
  }
  .estrella {
    position: absolute;
    right: 8px;
    bottom: 8px;
    color: var(--acento);
    font-size: 0.9rem;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
  }
  .barra {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    background: rgb(255 255 255 / 0.2);
  }
  .barra > span {
    display: block;
    height: 100%;
    background: var(--acento);
  }
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
  .marco {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: var(--radio);
  }
  .marco :global(img) {
    transition:
      opacity 150ms,
      transform 150ms;
  }
  .tarjeta:hover .marco :global(img),
  .tarjeta:focus-visible .marco :global(img) {
    opacity: 0.75;
    transform: scale(1.05);
  }
  /* Borde fino siempre y, con el ratón o el foco, un anillo interior. */
  .contorno {
    position: absolute;
    inset: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    pointer-events: none;
    transition: box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .tarjeta:hover .contorno,
  .tarjeta:focus-visible .contorno {
    box-shadow: inset 0 0 0 1px var(--borde);
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
  .tarjeta > span:not(.marco) {
    color: var(--texto-suave);
    font-size: 0.9em;
  }
  @media (prefers-reduced-motion: reduce) {
    .marco :global(img),
    .contorno,
    .acciones {
      transition: none;
    }
    .tarjeta:hover .marco :global(img),
    .tarjeta:focus-visible .marco :global(img) {
      transform: none;
    }
  }
</style>
