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
  import { SALTO_CORTO_S, SALTO_LARGO_S, formatearTiempo, tiempoEnPosicion } from '../lib/saltos.ts';
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
  let menuIdioma = $state(false);
  let contenedorIdioma = $state<HTMLElement>();
  let pista = $state<HTMLElement>();
  /** Con el cursor sobre la barra: x en píxeles desde su borde izquierdo y segundo que señala. */
  let cursor = $state<{ x: number; t: number } | null>(null);
  /** Mientras se arrastra sobre la barra: segundo señalado (se aplica al soltar). */
  let arrastre = $state<number | null>(null);

  const tiempoMostrado = $derived(arrastre ?? reproductor.posicion);
  const fraccionMostrada = $derived(
    reproductor.duracion > 0 ? Math.min(1, tiempoMostrado / reproductor.duracion) : 0,
  );

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
      if (!reproductor.pausa && !menuIdioma && arrastre === null) controlesVisibles = false;
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
    menuIdioma = false;
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

  /** Segundo que señala un evento de puntero sobre la barra de progreso. */
  function tiempoDe(e: PointerEvent): { x: number; t: number } | null {
    if (!pista) return null;
    const caja = pista.getBoundingClientRect();
    return {
      x: Math.min(caja.width, Math.max(0, e.clientX - caja.left)),
      t: tiempoEnPosicion(e.clientX, caja.left, caja.width, reproductor.duracion),
    };
  }

  function entrarEnBarra(e: PointerEvent) {
    if (e.button !== 0 || !pista || reproductor.duracion <= 0) return;
    pista.setPointerCapture(e.pointerId);
    const p = tiempoDe(e);
    if (p) arrastre = p.t;
  }

  function moverEnBarra(e: PointerEvent) {
    const p = tiempoDe(e);
    if (!p) return;
    cursor = p;
    if (arrastre !== null) arrastre = p.t;
  }

  function soltarEnBarra() {
    if (arrastre === null) return;
    const destino = arrastre;
    arrastre = null;
    void saltarAbsoluto(destino);
  }

  function alClicFuera(e: PointerEvent) {
    if (menuIdioma && contenedorIdioma && !contenedorIdioma.contains(e.target as Node)) menuIdioma = false;
  }

  function volver() {
    irA({ tipo: 'ficha', anime });
  }

  function teclas(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      // Esc cierra primero el desplegable de idioma; solo sin él abierto vuelve a la ficha.
      if (menuIdioma) menuIdioma = false;
      else volver();
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

<svelte:window onkeydown={teclas} onmousemove={mostrarControles} onpointerdown={alClicFuera} />

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
      {#if cambiandoIdioma}<span>Cambiando de idioma…</span>{/if}
      {#if playable?.servidor}
        <span class="etiqueta">{playable.calidad ? `${playable.calidad}p · ` : ''}{playable.servidor}</span>
      {/if}
    </header>

    {#if aviso}
      <div class="aviso" role="status">{aviso}</div>
    {/if}

    <footer class="barra abajo" class:oculta={!controlesVisibles}>
      <div
        class="progreso"
        bind:this={pista}
        role="slider"
        tabindex="0"
        aria-label="Posición"
        aria-valuemin={0}
        aria-valuemax={Math.round(reproductor.duracion)}
        aria-valuenow={Math.round(tiempoMostrado)}
        aria-valuetext={formatearTiempo(tiempoMostrado)}
        onpointerdown={entrarEnBarra}
        onpointermove={moverEnBarra}
        onpointerup={soltarEnBarra}
        onpointercancel={() => (arrastre = null)}
        onpointerleave={() => (cursor = null)}
      >
        <div class="pista"><div class="relleno" style:width="{fraccionMostrada * 100}%"></div></div>
        {#if cursor && reproductor.duracion > 0}
          <div class="burbuja" style:left="{cursor.x}px">{formatearTiempo(arrastre ?? cursor.t)}</div>
        {/if}
      </div>
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
        <div class="menu-idioma" bind:this={contenedorIdioma}>
          <button
            aria-haspopup="menu"
            aria-expanded={menuIdioma}
            disabled={cambiandoIdioma}
            onclick={() => (menuIdioma = !menuIdioma)}>{idioma} ▾</button
          >
          {#if menuIdioma}
            <div class="opciones" role="menu">
              {#each ['SUB', 'DUB'] as const as i (i)}
                <button
                  role="menuitemradio"
                  aria-checked={i === idioma}
                  class:activo={i === idioma}
                  onclick={() => elegirIdioma(i)}>{i === idioma ? '✓ ' : ''}{i}</button
                >
              {/each}
            </div>
          {/if}
        </div>
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
  input.volumen {
    width: 110px;
  }
  /* Barra de progreso: alta de pulsar (20 px) con una pista fina dentro. */
  .progreso {
    position: relative;
    height: 20px;
    display: flex;
    align-items: center;
    cursor: pointer;
    touch-action: none;
  }
  .pista {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    overflow: hidden;
  }
  .progreso:hover .pista,
  .progreso:focus-visible .pista {
    height: 8px;
  }
  .relleno {
    height: 100%;
    background: #e5484d;
  }
  .burbuja {
    position: absolute;
    bottom: 24px;
    transform: translateX(-50%);
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid #666;
    border-radius: 4px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
  }
  .menu-idioma {
    position: relative;
  }
  .opciones {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: rgba(0, 0, 0, 0.92);
    border: 1px solid #666;
    border-radius: 6px;
  }
  .opciones button.activo {
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
