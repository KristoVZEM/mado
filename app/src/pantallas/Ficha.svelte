<script lang="ts">
  import { onMount } from 'svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import { portadaGrande, urlCaptura, urlPortada } from '../lib/imagenes.ts';
  import { urlFondoTmdb, urlLogoTmdb } from '../lib/tmdb.ts';
  import { imagenesTmdb } from '../lib/tmdbServicio.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import { cargarEpisodios as cargarEpisodiosDeApp } from '../lib/episodiosApp.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { abrir, buscarEnCatalogo, cerrarSuperior } from '../lib/navegacion.svelte.ts';
  import {
    alternarFavorito,
    desmarcarVisto,
    episodiosVistos,
    esFavorito,
    estadoSerie,
    fijarEstado,
    leerAjuste,
    marcarVisto,
    progresoDeSerie,
    seriesParaSync,
    vinculoConMedia,
    type FilaTmdb,
    type RelacionAnilist,
    type VinculoConMedia,
  } from '../lib/datos.ts';
  import { asegurarVinculo, elegirVinculo, refrescarSiHaceFalta } from '../lib/anilistServicio.ts';
  import { esDudoso, textoProximo } from '../lib/anilist.ts';
  import EpisodiosFicha from '../lib/componentes/EpisodiosFicha.svelte';
  import EscogerObra from '../lib/componentes/EscogerObra.svelte';
  import RelacionadasFicha from '../lib/componentes/RelacionadasFicha.svelte';
  import Menu from '../lib/componentes/Menu.svelte';
  import { ajustes, asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { avisarFalloDeFuente, fuenteRecuperada } from '../lib/fuente.svelte.ts';
  import { ordenarEpisodios } from '../lib/ajustes.ts';
  import { idiomaGuardado } from '../lib/continuar.ts';
  import { completarSiTermino } from '../lib/completar.ts';
  import { anterioresDe } from '../lib/progreso.ts';
  import { episodioPrincipal, textoPrincipal, type ProgresoEp } from '../lib/episodiosFicha.ts';
  import { avisarCambio, cargarCuenta, sync } from '../lib/sync.svelte.ts';
  import { ESTADOS, nombreEstado } from '../lib/biblioteca.ts';
  import {
    confianza,
    UMBRAL_AUTO,
    type Ficha,
    type Idioma,
    type MediaAnilist,
    type ResultadoBusqueda,
  } from '../../../core/src/index.ts';

  let { anime }: { anime: ResultadoBusqueda } = $props();

  let ficha = $state<Ficha | null>(null);
  let tmdb = $state<FilaTmdb | null>(null);
  let logoFallido = $state(false);
  let cargando = $state(true);
  let error = $state('');
  let idioma = $state<Idioma>('SUB');
  let vistos = $state(new Set<number>());
  let progresos = $state<ProgresoEp[]>([]);

  // Biblioteca: solo se ofrece si se pudo leer al abrir. `estado` 0 = Ninguno.
  let bibliotecaOk = $state(false);
  let estado = $state(0);
  let favorito = $state(false);
  let guardando = $state(false);
  let avisoBiblioteca = $state('');

  // AniList: todo opcional. Si falla o no hay red, la Ficha funciona igual sin estos datos.
  let vinculo = $state<VinculoConMedia | null>(null);
  let candidatos = $state<MediaAnilist[]>([]);
  let preguntaDescartada = $state(false);
  const media = $derived(vinculo?.media ?? null);
  const dudoso = $derived(vinculo ? esDudoso(vinculo.vinculo) : false);
  const opcionesObra = $derived([...(media ? [media] : []), ...candidatos]);
  const proximo = $derived(media ? textoProximo(media.siguienteEp, media.siguienteEn, Date.now() / 1000) : null);
  const textoPlano = (t: string) => t.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  async function cargarAniList() {
    try {
      const estadoV = await asegurarVinculo(serie, { anio: ficha?.anio ?? null, episodios: numeros.length || null });
      vinculo = await refrescarSiHaceFalta(estadoV.actual, serie.titulo);
      candidatos = estadoV.candidatos;
      if (vinculo?.media) void cargarTmdb(vinculo.media);
    } catch (e) {
      console.error(e);
    }
  }

  /** Fondo y logo de TMDB: opcionales, llegan cuando llegan y no bloquean nada. */
  async function cargarTmdb(m: MediaAnilist) {
    tmdb = await imagenesTmdb(m);
    logoFallido = false;
  }

  async function elegir(m: MediaAnilist) {
    try {
      await elegirVinculo(serie, m);
      vinculo = await vinculoConMedia(anime.aid);
      candidatos = [];
      tmdb = null;
      if (vinculo?.media) void cargarTmdb(vinculo.media);
    } catch (e) {
      console.error(e);
    }
  }

  /** Abre una serie relacionada: la busca en animeav1 y, si hay una coincidencia firme, abre su Ficha. */

  async function abrirRelacionada(r: RelacionAnilist) {
    try {
      const candidato = {
        anilistId: r.anilistId,
        tituloRomaji: r.titulo,
        tituloIngles: null,
        tituloNativo: null,
        sinonimos: [],
        anio: null,
        episodios: null,
      };
      // Se abre el mejor resultado, no el primero que pase el umbral (las temporadas hermanas se parecen).
      let mejor: { res: ResultadoBusqueda; c: number } | null = null;
      for (const res of await fuentes.buscar(r.titulo)) {
        const c = confianza({ titulo: res.title }, candidato);
        if (!mejor || c > mejor.c) mejor = { res, c };
      }
      if (mejor && mejor.c >= UMBRAL_AUTO) {
        abrir({ tipo: 'ficha', anime: mejor.res });
        return;
      }
    } catch (e) {
      console.error(e);
    }
    buscarEnCatalogo(r.titulo);
  }

  let sinopsisAbierta = $state(false);
  let sinopsisEl = $state<HTMLElement | null>(null);
  /** Solo se ofrece «Mostrar más» si el texto de verdad se recorta. */
  let sinopsisRecorta = $state(false);
  const textoSinopsis = $derived(ficha?.synopsis || (media?.sinopsis ? textoPlano(media.sinopsis) : ''));
  $effect(() => {
    void textoSinopsis;
    const el = sinopsisEl;
    if (el && !sinopsisAbierta) sinopsisRecorta = el.scrollHeight > el.clientHeight + 1;
  });
  let filasAbiertas = $state<Record<string, boolean>>({});
  const MAX_CHIPS_FILA = 4;
  /** Géneros y estudio, en filas con su etiqueta. */
  const filas = $derived(
    [
      { nombre: 'Géneros', valores: ficha?.genres ?? [] },
      { nombre: 'Estudio', valores: media?.estudio ? [media.estudio] : [] },
    ].filter((f) => f.valores.length > 0),
  );

  const numeros = $derived(ficha ? ficha.episodes.map((e) => e.number).sort((a, b) => a - b) : []);
  /** Año, nota, formato y estado, como chips bajo el título. */
  const chips = $derived(
    [
      ficha?.anio ? String(ficha.anio) : null,
      media?.puntuacion != null ? `★ ${(media.puntuacion / 10).toFixed(1)}` : null,
      media?.formato ?? null,
      numeros.length > 0 ? `${numeros.length} episodios` : null,
      media?.duracion ? `${media.duracion} min` : null,
      ficha?.status || null,
      proximo ? `Próximo: ${proximo}` : null,
    ].filter((x): x is string => Boolean(x)),
  );
  /** Orden de la lista en pantalla; `numeros` se queda ascendente porque el reproductor calcula el siguiente con él. */
  const mostrados = $derived(ordenarEpisodios(numeros, ajustes.ordenDescendente));
  let avisoEpisodios = $state('');
  const progresoPorNumero = $derived(new Map(progresos.map((p) => [p.numero, p])));
  /** El episodio que ofrece el botón grande: el que dejaste a medias, el siguiente sin ver, o volver al primero. */
  const principal = $derived(episodioPrincipal(numeros, vistos, progresos));
  let fondosFallidos = $state<string[]>([]);
  let fondoListo = $state(false);
  const urlFondo = $derived(tmdb?.fondo ? urlFondoTmdb(tmdb.fondo) : null);
  /** Fondo de la cabecera: el de TMDB (16:9), si no el banner de AniList, si no una captura y, si no, el póster. */
  const fondo = $derived(
    [urlFondo, media?.banner ?? null, principal ? urlCaptura(anime.aid, principal.numero) : null, urlPortada(anime.aid)].find(
      (u) => u !== null && !fondosFallidos.includes(u),
    ) ?? null,
  );
  const logo = $derived(tmdb?.logo && !logoFallido ? urlLogoTmdb(tmdb.logo) : null);
  const serie = $derived({ aid: anime.aid, slug: anime.slug, titulo: ficha?.title || anime.title });

  onMount(async () => {
    if (!sync.cuenta) void cargarCuenta(); // para saber si la ayuda del «×» debe mencionar AniList
    // Los datos locales son accesorios: si fallan, la ficha funciona igual, sin ✓, en SUB y sin
    // estado ni favorito.
    const datos = Promise.all([
      episodiosVistos(anime.aid).catch(() => [] as number[]),
      leerAjuste(`idioma:${anime.aid}`).catch(() => null),
      asegurarAjustes(),
      progresoDeSerie(anime.aid).catch(() => [] as ProgresoEp[]),
    ]).then(([v, i, , p]) => {
      vistos = new Set(v);
      progresos = p;
      idioma = idiomaGuardado(i, ajustes.idiomaDefecto);
    });
    const biblioteca = Promise.all([estadoSerie(anime.aid), esFavorito(anime.aid)])
      .then(([e, f]) => {
        estado = e ?? 0;
        favorito = f;
        bibliotecaOk = true;
      })
      .catch((e) => console.error(e));
    await cargarEpisodios();
    await Promise.all([datos, biblioteca]);
  });

  /**
   * Carga los episodios con la caché primero: si ya se vio esta serie, la última lista guardada sale al instante y la
   * fresca de la fuente la sustituye al llegar. Si la fuente falla, la Ficha sigue con lo guardado (la lista, los datos de
   * AniList, estado, favorito y vistos) y lo avisa; sin nada guardado, ofrece reintentar. Los datos de AniList se
   * cargan en todo caso.
   */
  async function cargarEpisodios() {
    cargando = true;
    error = '';
    let aniListIniciado = false;
    const r = await cargarEpisodiosDeApp(anime.slug, (f, origen) => {
      ficha = f;
      // Con la lista a la vista ya no hay nada que esperar; AniList (portada, notas) empieza sin esperar a la fuente.
      cargando = false;
      if (origen === 'cache' && !aniListIniciado) {
        aniListIniciado = true;
        void cargarAniList();
      }
    });
    if (r.error === null) {
      fuenteRecuperada();
    } else {
      console.error(r.error);
      error = r.ficha ? `Se muestra la última lista guardada. ${mensajeDeError(r.error)}` : mensajeDeError(r.error);
      avisarFalloDeFuente(r.error);
    }
    cargando = false;
    if (!aniListIniciado && (ficha || vinculo === null)) void cargarAniList();
  }

  /** Quita un episodio de los vistos; si falla, vuelve a ponerlo y avisa. */
  async function desmarcar(n: number) {
    const antes = vistos;
    vistos = new Set([...vistos].filter((x) => x !== n));
    avisoEpisodios = '';
    try {
      await desmarcarVisto(anime.aid, n);
    } catch (e) {
      console.error(e);
      vistos = antes;
      avisoEpisodios = `No se pudo quitar el episodio ${n} de los vistos: ${textoDeError(e)}`;
    }
  }

  /**
   * Marca el episodio `n` y todos los anteriores como vistos. Como al verlo en el reproductor, si con esto se
   * completa la serie el estado cambia antes de avisar a la sincronización. Al acabar relee la base: es la
   * fuente de verdad de lo visto y de lo que queda a medias.
   */
  async function marcarHasta(n: number) {
    avisoEpisodios = '';
    try {
      await marcarVisto(serie, n, undefined, anterioresDe(numeros, n));
      await completarSiTermino(serie, { local: async (aid) => (await seriesParaSync(aid))[0], fijarEstado });
      avisarCambio(serie.aid);
    } catch (e) {
      console.error(e);
      avisoEpisodios = `No se pudo marcar como vistos los episodios hasta el ${n}: ${textoDeError(e)}`;
    }
    try {
      const [v, p, e] = await Promise.all([episodiosVistos(anime.aid), progresoDeSerie(anime.aid), estadoSerie(anime.aid)]);
      vistos = new Set(v);
      progresos = p;
      estado = e ?? 0;
    } catch (e) {
      console.error(e);
    }
  }

  function reproducir(numero: number) {
    abrir({ tipo: 'reproducir', anime, numeros, numero, idioma });
  }

  /** Muestra el estado nuevo mientras se guarda; si falla, vuelve al anterior y avisa. */
  async function cambiarEstado(nuevo: number) {
    menu = null;
    if (nuevo === estado) return;
    const anterior = estado;
    estado = nuevo;
    guardando = true;
    avisoBiblioteca = '';
    try {
      await fijarEstado(serie, nuevo);
      avisarCambio(serie.aid);
    } catch (e) {
      console.error(e);
      estado = anterior;
      avisoBiblioteca = `No se pudo guardar el estado: ${textoDeError(e)}`;
    } finally {
      guardando = false;
    }
  }

  /** Menú abierto bajo la fila de acciones: el de la biblioteca o el de «más opciones». */
  let menu = $state<'estado' | 'mas' | null>(null);
  let forzarEscoger = $state(false);
  let enlaceCopiado = $state(false);

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(`https://animeav1.com/media/${anime.slug}`);
      enlaceCopiado = true;
      setTimeout(() => (enlaceCopiado = false), 2000);
    } catch (e) {
      console.error(e);
    }
    menu = null;
  }

  function elegirOtraObra() {
    menu = null;
    preguntaDescartada = false;
    forzarEscoger = true;
  }

  async function alternar() {
    guardando = true;
    avisoBiblioteca = '';
    try {
      favorito = await alternarFavorito(serie);
    } catch (e) {
      console.error(e);
      avisoBiblioteca = `No se pudo cambiar el favorito: ${textoDeError(e)}`;
    } finally {
      guardando = false;
    }
  }
</script>

<main class="pantalla ficha zona-oscura">
  {#if fondo}
    <div class="fondo" class:panoramico={fondo === urlFondo} aria-hidden="true">
      <img
        class:listo={fondoListo}
        class:difuso={fondo !== media?.banner && fondo !== urlFondo}
        src={fondo}
        alt=""
        onload={() => (fondoListo = true)}
        onerror={() => (fondosFallidos = [...fondosFallidos, fondo])}
      />
    </div>
  {/if}
  <div class="capa">
    <button class="volver" onclick={cerrarSuperior} aria-label="Volver" title="Volver">←</button>
    <div class="cabecera">
      <div class="portada-ficha"><Portada
          aid={anime.aid}
          titulo={ficha?.title || anime.title}
          preferida={media?.portada ? portadaGrande(media.portada) : null}
        /></div>
      <div class="datos">
        {#if logo}
          <h1 class="titulo-logo">
            <img src={logo} alt={ficha?.title || anime.title} onerror={() => (logoFallido = true)} />
          </h1>
          <!-- El logo suele estar en el idioma original: el título en letras latinas dice qué serie es. -->
          <p class="subtitulo-logo" aria-hidden="true">{ficha?.title || anime.title}</p>
        {:else}
          <h1>{ficha?.title || anime.title}</h1>
        {/if}
        {#if chips.length > 0}
          <ul class="chips" aria-label="Datos de la serie">
            {#each chips as c (c)}<li>{c}</li>{/each}
          </ul>
        {/if}
        <div class="acciones">
          {#if principal}
            <button class="principal" onclick={() => reproducir(principal.numero)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
              {textoPrincipal(principal)}
            </button>
          {/if}
          {#if bibliotecaOk}
            <button
              class="icono"
              onclick={alternar}
              disabled={guardando}
              aria-pressed={favorito}
              title={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
              aria-label="Favorito"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class:relleno={favorito}>
                <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" />
              </svg>
            </button>
            <div class="ancla">
              <button
                class="icono"
                class:activo={estado !== 0}
                onclick={() => (menu = menu === 'estado' ? null : 'estado')}
                disabled={guardando}
                aria-haspopup="menu"
                aria-expanded={menu === 'estado'}
                title={estado !== 0 ? `En tu biblioteca: ${nombreEstado(estado)}` : 'Guardar en tu biblioteca'}
                aria-label={estado !== 0 ? `En tu biblioteca: ${nombreEstado(estado)}. Cambiar` : 'Guardar en tu biblioteca'}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" class:relleno={estado !== 0}>
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
                </svg>
              </button>
              <Menu abierto={menu === 'estado'} etiqueta="Estado en tu biblioteca" alCerrar={() => (menu = null)}>
                {#each [{ valor: 0, nombre: 'Sin estado' }, ...ESTADOS] as e (e.valor)}
                  <button role="menuitemradio" aria-checked={estado === e.valor} onclick={() => cambiarEstado(e.valor)}>
                    <svg class="marca-menu" viewBox="0 0 24 24" aria-hidden="true">
                      {#if estado === e.valor}<path d="M5 12.5l4.5 4.5L19 7.5" />{/if}
                    </svg>
                    {e.nombre}
                  </button>
                {/each}
              </Menu>
            </div>
          {/if}
          <div class="ancla">
            <button
              class="icono"
              onclick={() => (menu = menu === 'mas' ? null : 'mas')}
              aria-haspopup="menu"
              aria-expanded={menu === 'mas'}
              title="Más opciones"
              aria-label="Más opciones"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="puntos">
                <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
              </svg>
            </button>
            <Menu abierto={menu === 'mas'} etiqueta="Más opciones" alCerrar={() => (menu = null)}>
              {#if opcionesObra.length > 1}
                <button role="menuitem" onclick={elegirOtraObra}>Elegir otra obra de AniList</button>
              {/if}
              <button role="menuitem" onclick={copiarEnlace}>{enlaceCopiado ? 'Enlace copiado' : 'Copiar enlace de la serie'}</button>
            </Menu>
          </div>
        </div>
        {#if avisoBiblioteca}<p class="error" role="alert">{avisoBiblioteca}</p>{/if}
        {#if textoSinopsis}
          <div class="bloque-sinopsis">
            <p class="sinopsis" class:recortada={!sinopsisAbierta} bind:this={sinopsisEl}>{textoSinopsis}</p>
            {#if sinopsisRecorta || sinopsisAbierta}
              <button class="enlace" aria-expanded={sinopsisAbierta} onclick={() => (sinopsisAbierta = !sinopsisAbierta)}>
                {sinopsisAbierta ? 'Mostrar menos' : 'Mostrar más'}
              </button>
            {/if}
          </div>
        {/if}
        {#if filas.length > 0}
          <dl class="filas">
            {#each filas as f (f.nombre)}
              <dt>{f.nombre}</dt>
              <dd>
                <ul class="chips etiquetas">
                  {#each filasAbiertas[f.nombre] ? f.valores : f.valores.slice(0, MAX_CHIPS_FILA) as v (v)}<li>{v}</li>{/each}
                  {#if f.valores.length > MAX_CHIPS_FILA}
                    <li class="mas">
                      <button class="enlace" onclick={() => (filasAbiertas[f.nombre] = !filasAbiertas[f.nombre])}>
                        {filasAbiertas[f.nombre] ? 'Mostrar menos' : `+${f.valores.length - MAX_CHIPS_FILA} más`}
                      </button>
                    </li>
                  {/if}
                </ul>
              </dd>
            {/each}
          </dl>
        {/if}
      </div>
    </div>

    {#if (dudoso || forzarEscoger) && !preguntaDescartada && opcionesObra.length > 0}
      <EscogerObra candidatos={opcionesObra} alElegir={elegir} alDescartar={() => {
          preguntaDescartada = true;
          forzarEscoger = false;
        }} />
    {/if}

    {#if cargando}<Esqueleto variante="fila" cantidad={6} />{/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
      {#if !ficha}<button onclick={cargarEpisodios} disabled={cargando}>Reintentar</button>{/if}
    {/if}

    {#if ficha}
      <EpisodiosFicha
        aid={anime.aid}
        titulo={serie.titulo}
        total={numeros.length}
        {mostrados}
        {vistos}
        {progresoPorNumero}
        principalNumero={principal?.numero}
        duracionMedia={media?.duracion}
        bind:idioma
        conCuenta={Boolean(sync.cuenta)}
        aviso={avisoEpisodios}
        difuminar={ajustes.difuminarMiniaturas}
        alReproducir={reproducir}
        alDesmarcar={desmarcar}
        alMarcarHasta={marcarHasta}
      />
    {/if}

    {#if media && media.relaciones.length > 0}
      <RelacionadasFicha relaciones={media.relaciones} alAbrir={abrirRelacionada} />
    {/if}
  </div>
</main>

<style>
  .ficha {
    position: relative;
    overflow: hidden;
    padding: 128px 48px 48px;
  }
  /* Banner o captura de fondo: se desplaza con la página y se funde con el fondo por dos velos. */
  .fondo {
    position: absolute;
    inset: 0 0 auto 0;
    /* Un banner de AniList mide unos 1900×550: con más alto que esto se ampliaría y se vería borroso. */
    height: min(85vh, max(420px, 36vw));
    overflow: hidden;
    z-index: 0;
    pointer-events: none;
  }
  /* El fondo de TMDB es 16:9 y de 1920 px: se puede mostrar a toda altura. */
  .fondo.panoramico {
    height: 85vh;
  }
  .fondo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 20%;
    opacity: 0;
    filter: blur(16px);
    transition:
      opacity 700ms ease-out,
      filter 700ms ease-out;
  }
  /* Capturas y pósteres son pequeños (220–230 px): se difuminan, no se ven como imagen. */
  .fondo img.difuso.listo {
    transform: scale(1.1);
    filter: blur(18px) brightness(0.7) saturate(0.8);
  }
  .fondo img.listo {
    opacity: 0.4;
    /* Los banners de AniList son brillantes y saturados: se apagan para que no compitan con el texto. */
    filter: blur(0) brightness(0.7) saturate(0.8);
  }
  .fondo::before,
  .fondo::after {
    content: '';
    position: absolute;
    inset: 0;
  }
  .fondo::before {
    background: linear-gradient(to right, #0a0a0a 0%, rgb(10 10 10 / 0.88) 45%, rgb(10 10 10 / 0.45) 75%, transparent 100%);
  }
  .fondo::after {
    top: 50%;
    background: linear-gradient(to top, #0a0a0a 0%, rgb(10 10 10 / 0.85) 50%, transparent 100%);
  }
  .capa {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 48px;
  }
  .volver {
    justify-self: start;
    width: 36px;
    padding: 0;
    font-size: 1.05rem;
    margin-bottom: -24px;
  }
  .cabecera {
    display: grid;
    grid-template-columns: clamp(200px, 22vw, 320px) 1fr;
    gap: 48px;
    align-items: start;
  }
  .portada-ficha {
    border: 1px solid var(--borde);
    border-radius: var(--radio-grande);
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.85);
  }
  .portada-ficha :global(.portada) {
    border-radius: 0;
  }
  .datos {
    display: flex;
    flex-direction: column;
    gap: 20px;
    min-width: 0;
  }
  .datos h1 {
    margin: 0;
    font-size: clamp(2.25rem, 1.4rem + 2.6vw, 3.75rem);
    line-height: 1;
    font-weight: 700;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }
  /* El título bajo el logo se pega a él, no al resto de datos. */
  .subtitulo-logo {
    margin: -12px 0 0;
    color: var(--texto-suave);
    font-size: 1rem;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.85);
  }
  .titulo-logo img {
    display: block;
    max-width: min(100%, 560px);
    max-height: 180px;
    object-fit: contain;
    object-position: left;
    filter: drop-shadow(0 2px 8px rgb(0 0 0 / 0.6));
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid var(--borde);
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    background: rgb(10 10 10 / 0.45);
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
  }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    /* Los botones de biblioteca llegan después de leer la base: se reserva la altura de la fila para que nada salte. */
    min-height: 36px;
  }
  .acciones .principal {
    padding: 8px 16px;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    transition:
      transform 200ms ease-out,
      background 150ms;
  }
  .acciones .principal:hover:not(:disabled) {
    transform: scale(1.05);
  }
  .acciones .principal:active:not(:disabled) {
    transform: scale(0.95);
  }
  .icono {
    width: 36px;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .icono svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .icono svg.relleno {
    fill: currentColor;
  }
  /* Sobre el banner, el fondo translúcido de los controles se pierde: aquí llevan un fondo oscuro con desenfoque. */
  .acciones > .icono,
  .ancla > .icono,
  .volver {
    background: rgb(10 10 10 / 0.6);
    backdrop-filter: blur(8px);
    border-color: rgb(255 255 255 / 0.25);
  }
  .acciones > .icono:hover:not(:disabled),
  .ancla > .icono:hover:not(:disabled),
  .volver:hover {
    background: rgb(38 38 38 / 0.75);
  }
  .ancla {
    position: relative;
  }
  .ancla > .icono.activo,
  .ancla > .icono.activo:hover:not(:disabled) {
    background: var(--boton-claro);
    border-color: var(--boton-claro);
    color: var(--boton-claro-texto);
  }
  .icono svg.puntos {
    fill: currentColor;
    stroke: none;
  }
  .bloque-sinopsis {
    max-width: 768px;
    margin-top: 8px;
  }
  .sinopsis {
    margin: 0;
    font-size: 1.125rem;
    line-height: 1.625;
    color: rgb(250 250 250 / 0.95);
    /* Sombra suave: ayuda a leer cuando el banner es claro detrás del texto. */
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.85), 0 0 12px rgb(0 0 0 / 0.6);
  }
  .sinopsis.recortada {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .bloque-sinopsis .enlace {
    margin-top: 6px;
  }
  .filas {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 16px;
    align-items: start;
    max-width: 896px;
    margin: 0;
    padding-top: 24px;
    border-top: 1px solid var(--borde);
  }
  .filas dt {
    padding-top: 2px;
    color: var(--texto-suave);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .filas dd {
    margin: 0;
  }
  .etiquetas {
    gap: 6px;
  }
  .etiquetas li {
    padding: 2px 10px;
    border-color: var(--borde);
    background: var(--relleno);
  }
  .etiquetas li.mas {
    padding: 0 4px;
    border: 0;
    background: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .fondo img,
    .acciones .principal {
      transition: none;
    }
    .fondo img {
      filter: brightness(0.7) saturate(0.8);
    }
    .acciones .principal:hover:not(:disabled),
    .acciones .principal:active:not(:disabled) {
      transform: none;
    }
  }
</style>
