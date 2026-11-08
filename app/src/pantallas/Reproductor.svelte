<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { irA } from '../lib/navegacion.svelte.ts';
  import {
    alternarPausa,
    cargar,
    detener,
    reproductor,
    saltarAbsoluto,
    saltarRelativo,
  } from '../lib/reproductor.svelte.ts';
  import { SALTO_CORTO_S, SALTO_LARGO_S, formatearTiempo } from '../lib/saltos.ts';
  import type { Idioma, Playable, ResultadoBusqueda } from '../../../core/src/index.ts';

  let {
    anime,
    numeros,
    numero,
    idioma,
  }: { anime: ResultadoBusqueda; numeros: number[]; numero: number; idioma: Idioma } = $props();

  let estado = $state<'cargando' | 'listo' | 'error'>('cargando');
  let mensaje = $state('');
  let playable = $state<Playable | null>(null);
  let controlesVisibles = $state(true);
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let pantallaCompleta = false;
  let destruido = false;

  const siguiente = $derived.by<number | undefined>(() => {
    const i = numeros.indexOf(numero);
    return i >= 0 ? numeros[i + 1] : undefined;
  });

  onMount(async () => {
    try {
      const p = await fuentes.resolver(anime.slug, numero, idioma);
      if (destruido) return;
      playable = p;
      await cargar(p);
      if (destruido) return;
      estado = 'listo';
      mostrarControles();
    } catch (e) {
      console.error(e);
      mensaje = mensajeDeError(e);
      estado = 'error';
    }
  });

  onDestroy(() => {
    destruido = true;
    clearTimeout(temporizador);
    void detener();
    if (pantallaCompleta) void getCurrentWindow().setFullscreen(false);
  });

  function mostrarControles() {
    controlesVisibles = true;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (!reproductor.pausa) controlesVisibles = false;
    }, 3000);
  }

  async function alternarPantallaCompleta() {
    pantallaCompleta = !pantallaCompleta;
    await getCurrentWindow().setFullscreen(pantallaCompleta);
  }

  function volver() {
    irA({ tipo: 'ficha', anime });
  }

  function teclas(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      volver();
      return;
    }
    if (estado !== 'listo') return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        void alternarPausa();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        void saltarRelativo(-SALTO_CORTO_S);
        break;
      case 'ArrowRight':
        e.preventDefault();
        void saltarRelativo(SALTO_CORTO_S);
        break;
      case 'KeyS':
        void saltarRelativo(SALTO_LARGO_S);
        break;
      case 'KeyF':
        void alternarPantallaCompleta();
        break;
      default:
        return;
    }
    mostrarControles();
  }
</script>

<svelte:window onkeydown={teclas} onmousemove={mostrarControles} />

<div class="reproductor" class:transparente={estado === 'listo'} class:sin-cursor={estado === 'listo' && !controlesVisibles}>
  {#if estado === 'cargando'}
    <div class="centro">Resolviendo el episodio…</div>
  {/if}

  {#if estado === 'error'}
    <div class="centro">
      <p class="error">{mensaje}</p>
      <button onclick={volver}>Volver</button>
    </div>
  {/if}

  {#if estado === 'listo'}
    {#if reproductor.terminado}
      <div class="centro fondo">
        <p>Fin del episodio {numero}</p>
        {#if siguiente !== undefined}
          <button onclick={() => irA({ tipo: 'reproducir', anime, numeros, numero: siguiente, idioma })}>
            Siguiente episodio ({siguiente})
          </button>
        {/if}
        <button onclick={volver}>Volver a la ficha</button>
      </div>
    {/if}

    <header class="barra arriba" class:oculta={!controlesVisibles}>
      <button onclick={volver}>← Volver</button>
      <span>{anime.title} · Ep. {numero} · {idioma}</span>
      {#if playable?.servidor}
        <span class="etiqueta">{playable.calidad ? `${playable.calidad}p · ` : ''}{playable.servidor}</span>
      {/if}
    </header>

    <footer class="barra abajo" class:oculta={!controlesVisibles}>
      <input
        type="range"
        min="0"
        max={reproductor.duracion || 1}
        step="0.5"
        value={reproductor.posicion}
        onchange={(e) => saltarAbsoluto(Number(e.currentTarget.value))}
      />
      <div class="botones">
        <button onclick={() => saltarRelativo(-SALTO_CORTO_S)}>−{SALTO_CORTO_S}</button>
        <button onclick={alternarPausa}>{reproductor.pausa ? '▶' : '⏸'}</button>
        <button onclick={() => saltarRelativo(SALTO_CORTO_S)}>+{SALTO_CORTO_S}</button>
        <button onclick={() => saltarRelativo(SALTO_LARGO_S)}>+{SALTO_LARGO_S} s</button>
        <span class="tiempo">{formatearTiempo(reproductor.posicion)} / {formatearTiempo(reproductor.duracion)}</span>
        <button onclick={alternarPantallaCompleta}>⛶</button>
      </div>
    </footer>
  {/if}
</div>

<style>
  .reproductor {
    position: fixed;
    inset: 0;
    background: #000;
    color: #fff;
  }
  /* Con el vídeo en marcha, el fondo es transparente para ver el mpv que hay detrás. */
  .reproductor.transparente {
    background: transparent;
  }
  .reproductor.sin-cursor {
    cursor: none;
  }
  .centro {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .centro.fondo {
    background: rgba(0, 0, 0, 0.7);
  }
  .barra {
    position: absolute;
    left: 0;
    right: 0;
    padding: 10px 16px;
    display: flex;
    gap: 12px;
    align-items: center;
    transition: opacity 0.2s;
  }
  .barra.oculta {
    opacity: 0;
    pointer-events: none;
  }
  .arriba {
    top: 0;
    background: linear-gradient(rgba(0, 0, 0, 0.8), transparent);
  }
  .abajo {
    bottom: 0;
    flex-direction: column;
    align-items: stretch;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  }
  .botones {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .tiempo {
    margin-left: auto;
    margin-right: 8px;
    font-variant-numeric: tabular-nums;
  }
  .etiqueta {
    margin-left: auto;
    padding: 2px 8px;
    border: 1px solid #888;
    border-radius: 4px;
    font-size: 12px;
  }
  input[type='range'] {
    width: 100%;
  }
</style>
