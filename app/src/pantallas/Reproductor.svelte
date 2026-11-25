<script module lang="ts">
  /** Vive fuera de la instancia: al pasar de episodio la pantalla se remonta y debe seguir igual. */
  let pantallaCompleta = false;
  /** Fuera de la instancia por lo mismo: la pantalla se remonta en cada episodio y el aviso de datos es uno por sesión. */
  let avisoDatosDado = false;
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { mensajeDeError } from '../lib/errores.ts';
  import { abrir } from '../lib/navegacion.svelte.ts';
  import {
    alternarPausa,
    alternarSilencio,
    cambiarVolumen,
    cargar,
    detener,
    fijarVelocidad,
    fijarVolumen,
    reproductor,
    saltarAbsoluto,
    saltarRelativo,
  } from '../lib/reproductor.svelte.ts';
  import { cambiarIdioma } from '../lib/idioma.ts';
  import { VELOCIDADES, etiquetaVelocidad } from '../lib/velocidad.ts';
  import { estadoSiguiente } from '../lib/siguiente.ts';
  import { recordarServidor, resolverEpisodio } from '../lib/resolverEpisodio.ts';
  import { conExcluido, estaEsperandoDatos, fraccionAlmacenada } from '../lib/buffer.ts';
  import { soloServidor } from '../lib/servidores.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import SelectorServidor from '../lib/componentes/SelectorServidor.svelte';
  import BotonIntro from '../lib/componentes/BotonIntro.svelte';
  import { cambioDeCorte, introVisible, type TramoIntro } from '../lib/intro.ts';
  import { tramoDeIntro } from '../lib/aniskip.ts';
  import { SinServidor } from '../../../core/src/index.ts';
  import { ajustes, asegurarAjustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { completarSiTermino } from '../lib/completar.ts';
  import { fijarEstado, guardarProgreso, marcarVisto, progresoDe, seriesParaSync, type SerieRef } from '../lib/datos.ts';
  import { avisarCambio } from '../lib/sync.svelte.ts';
  import { alCerrar } from '../lib/cierre.ts';
  import { anterioresDe, debeGuardar, esVisto, posicionDeRetoma } from '../lib/progreso.ts';
  import { formatearTiempo, tiempoDeDigito, tiempoEnPosicion } from '../lib/saltos.ts';
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
  let destruido = false;
  let yaSaltado = false;
  const serie: SerieRef = $derived({ aid: anime.aid, slug: anime.slug, titulo: anime.title });
  /** Ya se marcó este episodio como visto: no se vuelve a guardar su progreso. */
  let visto = false;
  let ultimoGuardadoMs = Date.now();
  let ultimaPosicionGuardada = 0;
  let cambiandoIdioma = $state(false);
  // Servidores que en esta pantalla ya resolvieron pero no entregaron el vídeo (o que el usuario descartó).
  let excluidos: string[] = [];
  let cambiandoServidor = $state(false);
  // El servidor actual ya se anotó como «el de la última vez».
  let servidorRecordado = false;
  let aviso = $state('');
  let temporizadorAviso: ReturnType<typeof setTimeout> | undefined;
  let menuIdioma = $state(false);
  // Lo gestiona SelectorServidor; aquí se lee para el Esc y para no ocultar los controles con el menú abierto.
  let menuServidor = $state(false);
  let contenedorIdioma = $state<HTMLElement>();
  let menuVelocidad = $state(false);
  let contenedorVelocidad = $state<HTMLElement>();
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

  const anterior = $derived.by<number | undefined>(() => {
    const i = numeros.indexOf(numero);
    return i > 0 ? numeros[i - 1] : undefined;
  });

  // Como Netflix: en los últimos segundos aparece el botón de siguiente episodio, que se rellena y,
  // un instante antes del final, pasa solo. No hay forma de desactivarlo.
  const proximo = $derived(
    estado === 'listo' && siguiente !== undefined
      ? estadoSiguiente(reproductor.posicion, reproductor.duracion)
      : null,
  );

  /** Cambia de episodio conservando idioma y pantalla completa; solo actúa una vez por pantalla. */
  function irAEpisodio(destino: number | undefined) {
    if (destino === undefined || yaSaltado) return;
    // Saltar de episodio no lo marca como visto: eso lo decide el umbral del 85 % (o el final del
    // vídeo). Si se avanza con ⏭ antes de llegar, el episodio queda a medias, no visto.
    yaSaltado = true;
    abrir({ tipo: 'reproducir', anime, numeros, numero: destino, idioma });
  }

  const irAlSiguiente = () => irAEpisodio(siguiente);
  const irAlAnterior = () => irAEpisodio(anterior);

  $effect(() => {
    if (proximo?.saltar && ajustes.siguienteAuto) irAlSiguiente();
  });

  // Guarda mientras se reproduce (con límite) y marca visto al cruzar el umbral o al terminar.
  $effect(() => {
    const posicion = reproductor.posicion;
    const duracion = reproductor.duracion;
    const terminado = reproductor.terminado;
    if (estado !== 'listo') return;
    if (terminado || esVisto(posicion, duracion)) {
      // untrack: marcarComoVisto lee estado reactivo (visto, numeros...) que no debe volver a disparar este efecto.
      untrack(marcarComoVisto);
      return;
    }
    untrack(() => guardarAhora());
  });

  // Al pausar, guardar al momento.
  $effect(() => {
    if (reproductor.pausa) untrack(() => guardarAhora(true));
  });

  // mpv carga en segundo plano: un servidor que se cae o rechaza los segmentos avisa con end-file/error
  // cuando `cargar` ya devolvió. Sin esto la pantalla quedaría "lista" sin vídeo y sin mensaje.
  $effect(() => {
    // `cambiandoServidor` se lee aquí a propósito: si el servidor nuevo falla antes de que termine el cambio,
    // el efecto vuelve a correr al acabar y prueba el siguiente.
    if (reproductor.falloCarga && (estado === 'listo' || estado === 'cargando') && !cambiandoIdioma && !cambiandoServidor) {
      untrack(() => void probarOtroServidor());
    }
  });

  // El servidor se recuerda cuando mpv ya abrió el vídeo (conoce su duración), no al resolverlo.
  $effect(() => {
    if (estado !== 'listo' || !playable || !(reproductor.duracion > 0) || reproductor.falloCarga) return;
    const actual = playable;
    untrack(() => {
      if (servidorRecordado) return;
      servidorRecordado = true;
      recordarServidor(actual);
    });
  });

  // Tramo del opening según AniSkip (solo con el ajuste activo). Se pide una vez por corte del vídeo: la duración
  // de mpv puede variar un poco al cargar, y cambiar de servidor o de idioma puede traer otro corte.
  let tramoIntro = $state<TramoIntro | null>(null);
  let duracionIntro: number | null = null;
  $effect(() => {
    const duracion = reproductor.duracion;
    if (!ajustes.aniskipActivo || estado !== 'listo' || !playable || !(duracion > 0) || reproductor.falloCarga) return;
    const malId = playable.malId;
    untrack(() => {
      if (!cambioDeCorte(duracionIntro, duracion)) return;
      duracionIntro = duracion;
      tramoIntro = null;
      void tramoDeIntro({ malId, episodio: numero, duracion }).then((t) => {
        // Si mientras tanto llegó otra duración, esta respuesta ya no vale.
        if (!destruido && duracionIntro === duracion) tramoIntro = t;
      });
    });
  });

  function saltarIntro() {
    if (tramoIntro) void saltarAbsoluto(tramoIntro.fin);
  }

  const esperando = $derived(
    estado === 'listo' &&
      (cambiandoServidor ||
        (reproductor.duracion <= 0 && !reproductor.falloCarga) ||
        estaEsperandoDatos({
          pausadoPorCache: reproductor.pausadoPorCache,
          saltando: reproductor.saltando,
          terminado: reproductor.terminado,
        })),
  );
  const fraccionDescargada = $derived(
    fraccionAlmacenada(reproductor.almacenadoHasta, reproductor.posicion, reproductor.duracion),
  );

  onMount(async () => {
    try {
      await asegurarAjustes();
      const p = await resolverEpisodio(anime.slug, numero, idioma);
      if (destruido) return;
      playable = p;
      // Retomar donde se dejó; si la base falla o no hay punto válido, se empieza en 0:00.
      const inicio = posicionDeRetoma(
        await progresoDe(anime.aid, numero).catch((e) => {
          console.error(e);
          return null;
        }),
      );
      if (destruido) return;
      await cargar(p, inicio > 0 ? inicio : undefined);
      if (destruido) return;
      ultimoGuardadoMs = Date.now();
      ultimaPosicionGuardada = inicio;
      estado = 'listo';
      guardarAjusteSilencioso(`idioma:${anime.aid}`, idioma);
      mostrarControles();
    } catch (e) {
      console.error(e);
      mensaje = mensajeDeError(e);
      estado = 'error';
    }
  });

  // Al cerrar la ventana con la X se espera a que el progreso quede guardado (con tope de tiempo).
  const quitarAlCerrar = alCerrar(() => guardarAhora(true));

  onDestroy(() => {
    quitarAlCerrar();
    destruido = true;
    clearTimeout(temporizador);
    clearTimeout(temporizadorAviso);
    guardarAhora(true);
    void detener();
  });

  function mostrarControles() {
    controlesVisibles = true;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (!reproductor.pausa && !menuIdioma && !menuVelocidad && !menuServidor && arrastre === null) controlesVisibles = false;
    }, 3000);
  }

  async function alternarPantallaCompleta() {
    // Se pregunta a la ventana en vez de fiarse de lo recordado: al cerrar a la bandeja desde aquí se sale de
    // la pantalla completa sin pasar por esta pantalla.
    const ventana = getCurrentWindow();
    pantallaCompleta = !(await ventana.isFullscreen().catch(() => pantallaCompleta));
    await ventana.setFullscreen(pantallaCompleta);
  }

  function avisar(texto: string) {
    aviso = texto;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => (aviso = ''), 5000);
  }

  /** Los datos nunca bloquean la reproducción: se registra el fallo y se avisa una sola vez. */
  function falloDeDatos(e: unknown) {
    console.error(e);
    if (avisoDatosDado || destruido) return;
    avisoDatosDado = true;
    avisar('No se pudo guardar el progreso de este episodio.');
  }

  /** Guarda la posición actual si toca (o siempre, con `forzar`). No hace nada si ya está visto. */
  function guardarAhora(forzar = false): Promise<void> {
    if (visto || estado !== 'listo' || reproductor.duracion <= 0) return Promise.resolve();
    const posicion = reproductor.posicion;
    const ahoraMs = Date.now();
    if (
      !forzar &&
      !debeGuardar({
        ahoraMs,
        ultimoMs: ultimoGuardadoMs,
        posicion,
        ultimaPosicion: ultimaPosicionGuardada,
        velocidad: reproductor.velocidad,
      })
    ) {
      return Promise.resolve();
    }
    if (!(posicion > 0)) return Promise.resolve();
    ultimoGuardadoMs = ahoraMs;
    ultimaPosicionGuardada = posicion;
    return guardarProgreso(serie, numero, posicion, reproductor.duracion).catch(falloDeDatos);
  }

  /** Marca el episodio como visto una sola vez (y deja listo el siguiente en 0:00 en la base). */
  function marcarComoVisto() {
    if (visto) return;
    visto = true;
    marcarVisto(serie, numero, siguiente, anterioresDe(numeros, numero))
      // Si con este episodio se completa la serie, el estado cambia antes de avisar a la sincronización.
      .then(() =>
        completarSiTermino(serie, { local: async (aid) => (await seriesParaSync(aid))[0], fijarEstado }),
      )
      .then(() => avisarCambio(serie.aid))
      .catch(falloDeDatos);
  }

  // Carga el vídeo de otro servidor retomando en el mismo segundo y deja la pantalla lista.
  async function cargarEnOtroServidor(p: Playable, retoma: number) {
    playable = p;
    servidorRecordado = false;
    await cargar(p, retoma > 0 ? retoma : undefined);
    if (destruido) return;
    estado = 'listo';
    ultimoGuardadoMs = Date.now();
    ultimaPosicionGuardada = retoma;
    avisar(`Reproduciendo desde ${p.servidor ?? 'otro servidor'}.`);
  }

  // El usuario elige un servidor: se retoma el segundo y, si ese servidor no sirve, el vídeo actual sigue. Elegir
  // a mano borra lo descartado por fallos (si no, no se podría volver a un servidor que falló antes).
  async function elegirServidor(nombre: string, delEpisodio: string[]) {
    menuServidor = false;
    if (nombre === playable?.servidor || cambiandoServidor || cambiandoIdioma || destruido) return;
    cambiandoServidor = true;
    const retoma = reproductor.posicion;
    try {
      const { preferido, excluidos: fuera } = soloServidor(delEpisodio, nombre);
      const p = await resolverEpisodio(anime.slug, numero, idioma, fuera, preferido);
      if (destruido) return;
      excluidos = [];
      await cargarEnOtroServidor(p, retoma);
    } catch (e) {
      console.error(e);
      if (destruido) return;
      avisar(e instanceof SinServidor ? `${nombre} no está disponible ahora para este episodio.` : `No se pudo cambiar de servidor: ${mensajeDeError(e)}`);
    } finally {
      cambiandoServidor = false;
    }
  }

  // El servidor actual no entregó el vídeo: pasa al siguiente de la cadena conservando el segundo. Si no queda
  // ninguno, la pantalla pasa a error. Elegir uno a mano es `elegirServidor`.
  async function probarOtroServidor() {
    if (cambiandoServidor || cambiandoIdioma || destruido) return;
    const actual = playable?.servidor;
    cambiandoServidor = true;
    const retoma = reproductor.posicion;
    const candidatos = conExcluido(excluidos, actual);
    try {
      if (actual === undefined) throw new SinServidor('no se sabe qué servidor falló', []);
      avisar(`${actual} no entregó el vídeo. Probando otro servidor…`);
      const p = await resolverEpisodio(anime.slug, numero, idioma, candidatos);
      if (destruido) return;
      excluidos = candidatos;
      await cargarEnOtroServidor(p, retoma);
    } catch (e) {
      console.error(e);
      if (destruido) return;
      const sinMas = e instanceof SinServidor;
      mensaje = sinMas ? 'El servidor no entregó el vídeo y no hay otro disponible para este episodio.' : mensajeDeError(e);
      estado = 'error';
    } finally {
      cambiandoServidor = false;
    }
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
        resolver: (i) => resolverEpisodio(anime.slug, numero, i),
        cargar,
      });
      if (destruido) return;
      playable = p;
      // Otro idioma son otros embeds: lo descartado antes ya no cuenta.
      excluidos = [];
      servidorRecordado = false;
      // La pantalla se identifica por el número de episodio, así que esto no la remonta.
      abrir({ tipo: 'reproducir', anime, numeros, numero, idioma: nuevo });
      guardarAjusteSilencioso(`idioma:${anime.aid}`, nuevo);
      ultimoGuardadoMs = Date.now();
      ultimaPosicionGuardada = reproductor.posicion;
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
    if (menuVelocidad && contenedorVelocidad && !contenedorVelocidad.contains(e.target as Node)) {
      menuVelocidad = false;
    }
  }

  function volver() {
    // Pasar al siguiente episodio mantiene la pantalla completa; salir a la ficha la quita.
    if (pantallaCompleta) {
      pantallaCompleta = false;
      void getCurrentWindow().setFullscreen(false);
    }
    abrir({ tipo: 'ficha', anime });
  }

  /**
   * La barra espaciadora pausa en `keydown`; si el foco está en un botón, el navegador además lo
   * pulsa al soltarla y desharía la pausa. Cancelar el `keyup` evita esa segunda acción.
   */
  function soltarTecla(e: KeyboardEvent) {
    if (e.code === 'Space') e.preventDefault();
  }

  function pausarDesdeImagen() {
    void alternarPausa();
    mostrarControles();
  }

  function teclas(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      // Esc cierra primero cualquier desplegable abierto; solo sin ninguno vuelve a la ficha.
      if (menuIdioma || menuVelocidad || menuServidor) {
        menuIdioma = false;
        menuVelocidad = false;
        menuServidor = false;
      } else volver();
      return;
    }
    if (estado !== 'listo') return;
    // Con Ctrl o Alt la tecla es de otro (Ctrl+K, Alt+F4): no es un atajo del reproductor.
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        void alternarPausa();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        void saltarRelativo(-ajustes.saltoCorto);
        break;
      case 'ArrowRight':
        e.preventDefault();
        void saltarRelativo(ajustes.saltoCorto);
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
        void saltarRelativo(ajustes.saltoLargo);
        break;
      case 'KeyF':
        void alternarPantallaCompleta();
        break;
      case 'KeyN':
        irAlSiguiente();
        break;
      case 'KeyP':
        irAlAnterior();
        break;
      default: {
        // 0-9: salta a esa décima del episodio (5 = la mitad).
        const destino = tiempoDeDigito(e.code, reproductor.duracion);
        if (destino === null) return;
        e.preventDefault();
        void saltarAbsoluto(destino);
      }
    }
    mostrarControles();
  }
</script>

<svelte:window
  onkeydown={teclas}
  onkeyup={soltarTecla}
  onmousemove={mostrarControles}
  onpointerdown={alClicFuera}
/>

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
    <!-- Superficie transparente sobre el vídeo: un clic en la imagen pausa o reanuda. -->
    <button class="superficie" tabindex="-1" aria-label="Pausar o reanudar" onclick={pausarDesdeImagen} ondblclick={alternarPantallaCompleta}></button>

    {#if esperando}
      <div class="espera" role="status" aria-label="Cargando el vídeo"><span class="rueda"></span></div>
    {/if}

    {#if esperando}
      <div class="espera" role="status" aria-label="Cargando el vídeo"><span class="rueda"></span></div>
    {/if}

    {#if reproductor.terminado}
      <div class="centro fondo">
        <p>Fin del episodio {numero}</p>
        {#if siguiente !== undefined}
          <button onclick={irAlSiguiente}>Siguiente episodio ({siguiente})</button>
        {/if}
        <button onclick={volver}>Volver a la ficha</button>
      </div>
    {/if}

    <header class="barra arriba" class:oculta={!controlesVisibles}>
      <button onclick={volver}>← Volver</button>
      <span>{anime.title} · Ep. {numero}</span>
      {#if cambiandoIdioma}<span>Cambiando de idioma…</span>{/if}
    </header>

    {#if proximo?.visible && siguiente !== undefined}
      <button class="siguiente" class:alto={controlesVisibles} onclick={irAlSiguiente}>
        <span class="relleno-siguiente" style:width="{ajustes.siguienteAuto ? proximo.progreso * 100 : 0}%"></span>
        <span class="texto-siguiente">Siguiente episodio ({siguiente}) ▸</span>
      </button>
    {/if}

    <BotonIntro visible={introVisible(reproductor.posicion, tramoIntro)} alto={controlesVisibles} alSaltar={saltarIntro} />

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
        <div class="pista"><div class="almacenado" style:width="{fraccionDescargada * 100}%"></div><div class="relleno"style:width="{fraccionMostrada * 100}%"></div></div>
        {#if cursor && reproductor.duracion > 0}
          <div class="burbuja" style:left="{cursor.x}px">{formatearTiempo(arrastre ?? cursor.t)}</div>
        {/if}
      </div>
      <div class="botones">
        <button
          onclick={irAlAnterior}
          disabled={anterior === undefined}
          aria-label="Episodio anterior"
          title={anterior === undefined ? 'No hay episodio anterior' : `Episodio ${anterior}`}>⏮</button
        >
        <button onclick={() => saltarRelativo(-ajustes.saltoCorto)}>−{ajustes.saltoCorto}</button>
        <button onclick={alternarPausa}>{reproductor.pausa ? '▶' : '⏸'}</button>
        <button onclick={() => saltarRelativo(ajustes.saltoCorto)}>+{ajustes.saltoCorto}</button>
        <!-- Salto largo (85 s por defecto) con un símbolo, como el botón de Ukiku: una flecha que pasa por encima. -->
        <button
          class="salto-largo"
          onclick={() => saltarRelativo(ajustes.saltoLargo)}
          aria-label={`Avanzar ${ajustes.saltoLargo} segundos`}
          ><svg viewBox="0 0 24 24" aria-hidden="true"
            ><path d="M3 15a8 8 0 0 1 16 0" /><path d="M16 12l3 3 3-3" /><circle cx="11" cy="17" r="2" /></svg
          ></button
        >
        <button
          onclick={irAlSiguiente}
          disabled={siguiente === undefined}
          aria-label="Episodio siguiente"
          title={siguiente === undefined ? 'No hay episodio siguiente' : `Episodio ${siguiente}`}>⏭</button
        >
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
        <div class="menu-velocidad" bind:this={contenedorVelocidad}>
          <button
            aria-haspopup="menu"
            aria-expanded={menuVelocidad}
            aria-label="Velocidad de reproducción"
            onclick={() => (menuVelocidad = !menuVelocidad)}>{etiquetaVelocidad(reproductor.velocidad)} ▾</button
          >
          {#if menuVelocidad}
            <div class="opciones" role="menu">
              {#each VELOCIDADES as v (v)}
                <button
                  role="menuitemradio"
                  aria-checked={v === reproductor.velocidad}
                  class:activo={v === reproductor.velocidad}
                  onclick={() => {
                    menuVelocidad = false;
                    fijarVelocidad(v).catch((e) => console.error('no se pudo cambiar la velocidad', e));
                  }}>{v === reproductor.velocidad ? '✓ ' : ''}{etiquetaVelocidad(v)}</button
                >
              {/each}
            </div>
          {/if}
        </div>
        {#if playable?.servidor}
          <SelectorServidor
            servidor={playable.servidor}
            calidad={playable.calidad}
            clave={`${numero}:${idioma}`}
            pedirServidores={() => fuentes.servidores(anime.slug, numero, idioma)}
            alElegir={elegirServidor}
            ocupado={cambiandoServidor || cambiandoIdioma}
            bind:abierto={menuServidor}
          />
        {/if}
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
  /* Los controles del reproductor llevan su propio tamaño: no heredan el alto mínimo de los botones de las pantallas. */
  .reproductor :global(button) {
    min-height: 0;
  }
  .superficie {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    appearance: none;
    cursor: inherit;
  }
  /* Gana al `button:hover:not(:disabled)` global (app.css), que si no pinta la capa de gris. */
  .superficie:hover:not(:disabled) {
    background: transparent;
  }
  .siguiente {
    position: absolute;
    right: 24px;
    bottom: 28px;
    overflow: hidden;
    padding: 12px 22px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    transition: bottom 0.2s, background 0.15s, color 0.15s;
  }
  /* Con los controles a la vista se sube para no taparlos. */
  .siguiente.alto {
    bottom: 110px;
  }
  /* Al pasar el cursor se vuelve más sólido, para que se lea bien antes de pulsarlo. */
  .siguiente:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
  }
  .relleno-siguiente {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.25);
  }
  .texto-siguiente {
    position: relative;
    font-weight: 600;
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
  .salto-largo {
    display: inline-grid;
    place-items: center;
  }
  .salto-largo svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .salto-largo circle {
    fill: currentColor;
    stroke: none;
  }
  .tiempo {
    margin-left: auto;
    margin-right: 8px;
    font-variant-numeric: tabular-nums;
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
  .pista {
    position: relative;
  }
  /* Lo ya descargado, por detrás del avance. */
  .almacenado {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.35);
  }
  .relleno {
    position: relative;
    height: 100%;
    background: #e5484d;
  }
  /* Rueda de espera: aparece con medio segundo de retraso para no parpadear en cada salto corto. */
  .espera {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    opacity: 0;
    animation: aparecer 0.2s 0.5s forwards;
  }
  .rueda {
    width: 56px;
    height: 56px;
    border: 4px solid rgba(255, 255, 255, 0.25);
    border-top-color: #fff;
    border-radius: 50%;
    filter: drop-shadow(0 1px 4px rgba(0, 0, 0, 0.8));
    animation: girar 0.9s linear infinite;
  }
  @keyframes aparecer {
    to {
      opacity: 1;
    }
  }
  @keyframes girar {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .rueda {
      animation-duration: 4s;
    }
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
  .menu-idioma,
  .menu-velocidad {
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
