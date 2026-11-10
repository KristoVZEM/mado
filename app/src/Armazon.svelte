<script lang="ts">
  import type { Snippet } from 'svelte';
  import { CARRIL, type Seccion } from './lib/carril.ts';
  import { fuente, reintentarFuente } from './lib/fuente.svelte.ts';
  import { textoAvisoFuente } from './lib/fuente.ts';
  import { irASeccion, nav } from './lib/navegacion.svelte.ts';

  let { children }: { children: Snippet } = $props();

  /** Pasados 20 px de desplazamiento, la píldora gana fondo y pierde el degradado de detrás. */
  let desplazado = $state(false);

  // Iconos de 24×24 trazados con línea.
  const ICONOS: Record<Seccion, string> = {
    inicio: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    catalogo: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
    emision: 'M4 4h16v16H4zM4 9h16M9 4v16',
    biblioteca: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z',
    historial: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    ajustes:
      'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  };
</script>

<svelte:window onscroll={() => (desplazado = window.scrollY > 20)} />

<div class="armazon">
  <div class="velo" class:oculto={desplazado} aria-hidden="true"></div>
  <nav class="cabecera" class:desplazado aria-label="Secciones">
    {#each CARRIL as e (e.id)}
      <button
        class="elemento"
        class:aparte={e.id === 'ajustes'}
        title={e.nombre}
        aria-label={e.nombre}
        aria-current={nav.seccion === e.id && !nav.superior ? 'page' : undefined}
        onclick={() => irASeccion(e.id)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONOS[e.id]} /></svg>
        <span class="nombre">{e.nombre}</span>
      </button>
    {/each}
  </nav>
  <div class="contenido">
    {#if fuente.causa && !fuente.descartado}
      <div class="aviso-fuente" role="alert">
        <span>{textoAvisoFuente(fuente.causa)}</span>
        <button onclick={reintentarFuente} disabled={fuente.probando}>{fuente.probando ? 'Probando…' : 'Reintentar'}</button>
        <button onclick={() => (fuente.descartado = true)} aria-label="Cerrar el aviso">×</button>
      </div>
    {/if}
    {@render children()}
  </div>
</div>

<style>
  .aviso-fuente {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 72px var(--margen) 0;
    padding: 10px 14px;
    background: var(--superficie);
    border: 1px solid var(--borde);
    border-left: 3px solid var(--acento);
    border-radius: var(--radio);
  }
  /* Con el aviso puesto, él ya deja el hueco de la cabecera. */
  .aviso-fuente + :global(.pantalla) {
    padding-top: 24px;
  }
  .aviso-fuente span {
    flex: 1;
  }
  .armazon {
    min-height: 100vh;
    background: var(--fondo);
  }
  /* Degradado tras la píldora: deja leer la cabecera sobre un banner claro. */
  .velo {
    position: fixed;
    inset: 0 0 auto 0;
    height: 88px;
    z-index: 19;
    background: var(--velo-cabecera);
    pointer-events: none;
    transition: opacity 300ms;
  }
  .velo.oculto {
    opacity: 0;
  }
  /* Píldora flotante centrada: se queda fija sobre el contenido y sobre los banners. */
  .cabecera {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: var(--cabecera-fondo);
    backdrop-filter: blur(12px);
    border: 1px solid var(--borde);
    border-radius: 999px;
    transition: all 300ms;
  }
  .cabecera.desplazado {
    background: var(--cabecera-fondo-desplazada);
    backdrop-filter: blur(5px);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  }
  .elemento {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .elemento.aparte {
    margin-left: 6px;
  }
  .elemento:hover:not(:disabled) {
    background: var(--hover-cabecera);
    color: var(--texto);
  }
  .elemento[aria-current='page'] {
    color: var(--texto);
    background: var(--superficie-2);
  }
  .elemento:focus-visible {
    outline: 2px solid var(--anillo);
  }
  /* Con la ventana estrecha solo quedan los iconos. */
  @media (max-width: 820px) {
    .nombre {
      display: none;
    }
    .elemento {
      padding: 0 12px;
    }
  }
  svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .contenido {
    min-width: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .cabecera,
    .velo {
      transition: none;
    }
  }
</style>
