<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { irA } from '../lib/navegacion.svelte.ts';
  import {
    alternarPausa,
    alternarSilencio,
    cambiarVolumen,
    cargar,
    detener,
    fijarVolumen,
    reproductor,
    saltarAbsoluto,
    saltarRelativo,
  } from '../lib/reproductor.svelte.ts';
  import { cambiarIdioma } from '../lib/idioma.ts';
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
  let cambiandoIdioma = $state(false);
  let aviso = $state('');
  let temporizadorAviso: ReturnType<typeof setTimeout> | undefined;

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
    clearTimeout(temporizadorAviso);
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

  function avisar(texto: string) {
    aviso = texto;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => (aviso = ''), 5000);
  }

  /** Cambia SUB/DUB conservando el segundo; si el idioma nuevo falla, el vídeo actual sigue. */
  async function elegirIdioma(nuevo: Idioma) {
    if (nuevo === idioma || cambiandoIdioma) return;
    cambiandoIdioma = true;
    try {
      const p = await cambiarIdioma({
        nuevo,
        posicion: reproductor.posicion,
        resolver: (i) => fuentes.resolver(anime.slug, numero, i),
        cargar,
      });
      if (destruido) return;
      playable = p;
      // La pantalla se identifica por el número de episodio, así que esto no la remonta.
      irA({ tipo: 'reproducir', anime, numeros, numero, idioma: nuevo });
    } catch (e) {
      console.error(e);
      if (!destruido) avisar(`No se pudo cambiar a ${nuevo}: ${mensajeDeError(e)}`);
    } finally {
      cambiandoIdioma = false;
    }
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
      case 'ArrowUp':
        e.preventDefault();
        void cambiarVolumen(1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        void cambiarVolumen(-1);
        break;
      case 'KeyM':
        void alternarSilencio();
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
      <span>{anime.title} · Ep. {numero}</span>
      <span class="idioma" role="group" aria-label="Idioma">
        {#each ['SUB', 'DUB'] as const as i (i)}
          <button
            class:activo={i === idioma}
            aria-pressed={i === idioma}
            disabled={cambiandoIdioma}
            onclick={() => elegirIdioma(i)}>{i}</button
          >
        {/each}
      </span>
      {#if cambiandoIdioma}<span>Cambiando…</span>{/if}
      {#if playable?.servidor}
        <span class="etiqueta">{playable.calidad ? `${playable.calidad}p · ` : ''}{playable.servidor}</span>
      {/if}
    </header>

    {#if aviso}
      <div class="aviso" role="status">{aviso}</div>
    {/if}

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
        <button onclick={alternarSilencio} aria-label={reproductor.silencio ? 'Quitar silencio' : 'Silenciar'}>
          {reproductor.silencio || reproductor.volumen === 0 ? '🔇' : '🔊'}
        </button>
        <input
          class="volumen"
          type="range"
          min="0"
          max="100"
          step="5"
          aria-label="Volumen"
          value={reproductor.silencio ? 0 : reproductor.volumen}
          oninput={(e) => fijarVolumen(Number(e.currentTarget.value))}
        />
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
  input.volumen {
    width: 110px;
  }
  .idioma {
    display: inline-flex;
    gap: 4px;
  }
  .idioma button.activo {
    border-color: #fff;
    font-weight: 700;
  }
  .aviso {
    position: absolute;
    top: 64px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 14px;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid #c66;
    border-radius: 6px;
  }
</style>
