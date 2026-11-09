<script lang="ts">
  import { onMount } from 'svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import { fuentes } from '../lib/fuentes.ts';
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
    progresoDeSerie,
    vinculoConMedia,
    type RelacionAnilist,
    type VinculoConMedia,
  } from '../lib/datos.ts';
  import { asegurarVinculo, elegirVinculo, refrescarSiHaceFalta } from '../lib/anilistServicio.ts';
  import { esDudoso, textoProximo } from '../lib/anilist.ts';
  import EscogerObra from '../lib/componentes/EscogerObra.svelte';
  import { ajustes, asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { avisarFalloDeFuente, fuenteRecuperada } from '../lib/fuente.svelte.ts';
  import { ordenarEpisodios } from '../lib/ajustes.ts';
  import { fraccionVista, idiomaGuardado } from '../lib/continuar.ts';
  import { episodioPrincipal, textoPrincipal, textoQuedan, type ProgresoEp } from '../lib/episodiosFicha.ts';
  import { avisarCambio, cargarCuenta, sync } from '../lib/sync.svelte.ts';
  import { ESTADOS } from '../lib/biblioteca.ts';
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
    } catch (e) {
      console.error(e);
    }
  }

  async function elegir(m: MediaAnilist) {
    try {
      await elegirVinculo(serie, m);
      vinculo = await vinculoConMedia(anime.aid);
      candidatos = [];
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
  /** Año, nota, formato, estado y próximo episodio, como chips bajo el título. */
  const chips = $derived(
    [
      ficha?.anio ? String(ficha.anio) : null,
      media?.puntuacion != null ? `★ ${(media.puntuacion / 10).toFixed(1)}` : null,
      media?.formato ?? null,
      ficha?.status || null,
      proximo ? `Próximo: ${proximo}` : null,
    ].filter((x): x is string => Boolean(x)),
  );
  /** Géneros y estudio, en filas con su etiqueta. */
  const filas = $derived(
    [
      { nombre: 'Géneros', valores: ficha?.genres ?? [] },
      { nombre: 'Estudio', valores: media?.estudio ? [media.estudio] : [] },
    ].filter((f) => f.valores.length > 0),
  );
  const larga = $derived((ficha?.synopsis.length ?? 0) > 280);

  const numeros = $derived(ficha ? ficha.episodes.map((e) => e.number).sort((a, b) => a - b) : []);
  /** Orden de la lista en pantalla; `numeros` se queda ascendente porque el reproductor calcula el siguiente con él. */
  const mostrados = $derived(ordenarEpisodios(numeros, ajustes.ordenDescendente));
  let avisoDesmarcar = $state('');
  const progresoPorNumero = $derived(new Map(progresos.map((p) => [p.numero, p])));
  /** El episodio que ofrece el botón grande: el que dejaste a medias, el siguiente sin ver, o volver al primero. */
  const principal = $derived(episodioPrincipal(numeros, vistos, progresos));
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
   * Pide los episodios a la fuente. Si falla, la Ficha sigue mostrando lo guardado (datos de AniList, estado,
   * favorito y vistos) y ofrece reintentar. Los datos de AniList se cargan en todo caso.
   */
  async function cargarEpisodios() {
    cargando = true;
    error = '';
    try {
      ficha = await fuentes.episodios(anime.slug);
      fuenteRecuperada();
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      avisarFalloDeFuente(e);
    } finally {
      cargando = false;
    }
    if (ficha || vinculo === null) void cargarAniList();
  }

  /** Quita un episodio de los vistos; si falla, vuelve a ponerlo y avisa. */
  async function desmarcar(n: number) {
    const antes = vistos;
    vistos = new Set([...vistos].filter((x) => x !== n));
    avisoDesmarcar = '';
    try {
      await desmarcarVisto(anime.aid, n);
    } catch (e) {
      console.error(e);
      vistos = antes;
      avisoDesmarcar = `No se pudo quitar el episodio ${n} de los vistos: ${textoDeError(e)}`;
    }
  }

  function reproducir(numero: number) {
    abrir({ tipo: 'reproducir', anime, numeros, numero, idioma });
  }

  /** Muestra el estado nuevo mientras se guarda; si falla, vuelve al anterior y avisa. */
  async function cambiarEstado(evento: Event & { currentTarget: HTMLSelectElement }) {
    const anterior = estado;
    const nuevo = Number(evento.currentTarget.value);
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

<main class="pantalla ficha">
  <div class="fondo" style:background-image={media?.banner ? `url(${media.banner})` : undefined} aria-hidden="true"></div>
  <div class="capa">
    <button class="volver" onclick={cerrarSuperior} aria-label="Volver" title="Volver">←</button>
    <div class="cabecera">
      <div class="portada-ficha"><Portada aid={anime.aid} titulo={ficha?.title || anime.title} /></div>
      <div class="datos">
        <h1>{ficha?.title || anime.title}</h1>
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
              aria-label={favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}>{favorito ? '★' : '☆'}</button
            >
            <label class="estado">
              <span class="solo-lectores">Estado</span>
              <select value={estado} onchange={cambiarEstado} disabled={guardando} aria-label="Estado en tu biblioteca">
                <option value={0}>Sin estado</option>
                {#each ESTADOS as e (e.valor)}<option value={e.valor}>{e.nombre}</option>{/each}
              </select>
            </label>
          {/if}
        </div>
        {#if avisoBiblioteca}<p class="error" role="alert">{avisoBiblioteca}</p>{/if}
        {#if ficha?.synopsis}
          <p class="sinopsis" class:recortada={larga && !sinopsisAbierta}>{ficha.synopsis}</p>
          {#if larga}
            <button class="enlace" aria-expanded={sinopsisAbierta} onclick={() => (sinopsisAbierta = !sinopsisAbierta)}>
              {sinopsisAbierta ? 'Ver menos' : 'Ver más'}
            </button>
          {/if}
        {/if}
        {#if !ficha?.synopsis && media?.sinopsis}
          <p class="sinopsis">{textoPlano(media.sinopsis)}</p>
        {/if}
        {#if filas.length > 0}
          <dl class="filas">
            {#each filas as f (f.nombre)}
              <dt>{f.nombre}</dt>
              <dd>
                <ul class="chips">
                  {#each f.valores as v (v)}<li>{v}</li>{/each}
                </ul>
              </dd>
            {/each}
          </dl>
        {/if}
      </div>
    </div>

    {#if dudoso && !preguntaDescartada && opcionesObra.length > 0}
      <EscogerObra candidatos={opcionesObra} alElegir={elegir} alDescartar={() => (preguntaDescartada = true)} />
    {/if}

    {#if cargando}<Esqueleto variante="fila" cantidad={6} />{/if}
    {#if error}
      <p class="error">{error}</p>
      {#if !ficha}<button onclick={cargarEpisodios} disabled={cargando}>Reintentar</button>{/if}
    {/if}

    {#if ficha}
      <div class="barra-episodios">
        <h2>Episodios <span class="cuenta">{numeros.length}</span></h2>
        <div class="idioma" role="group" aria-label="Idioma">
          <button disabled={idioma === 'SUB'} onclick={() => (idioma = 'SUB')}>SUB</button>
          <button disabled={idioma === 'DUB'} onclick={() => (idioma = 'DUB')}>DUB</button>
        </div>
      </div>
      <ul class="lista-episodios" aria-label="Episodios">
        {#each mostrados as n (n)}
          {@const p = progresoPorNumero.get(n)}
          {@const fr = p ? fraccionVista(p.posicionS, p.duracionS) : null}
          {@const quedan = p ? textoQuedan(p.posicionS, p.duracionS) : null}
          <li class="episodio" class:visto={vistos.has(n)} class:actual={principal?.numero === n}>
            <button class="fila" onclick={() => reproducir(n)}>
              <span class="miniatura">
                <Portada aid={anime.aid} titulo={serie.titulo} numero={n} />
                {#if vistos.has(n)}
                  <svg class="marca" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {/if}
                {#if fr !== null}<progress value={fr} max="1" aria-hidden="true"></progress>{/if}
              </span>
              <span class="info">
                <strong>Episodio {n}</strong>
                {#if vistos.has(n)}<span>Visto</span>{:else if quedan}<span>{quedan}</span>{:else if principal?.numero === n}<span>Siguiente</span>{/if}
              </span>
            </button>
            {#if vistos.has(n)}
              <button
                class="quitar"
                onclick={() => desmarcar(n)}
                aria-label={`Marcar el episodio ${n} como no visto`}
                title={sync.cuenta ? 'Marcar como no visto. AniList puede volver a marcarlo.' : 'Marcar como no visto'}>×</button>
            {/if}
          </li>
        {/each}
      </ul>
      {#if avisoDesmarcar}<p class="error" role="alert">{avisoDesmarcar}</p>{/if}
    {/if}

    {#if media && media.relaciones.length > 0}
      <section class="relacionadas" aria-label="Relacionadas">
        <h2>Relacionadas</h2>
        <p>
          {#each media.relaciones as r (r.anilistId)}
            <button onclick={() => abrirRelacionada(r)}>{r.titulo} ({r.tipo})</button>
          {/each}
        </p>
      </section>
    {/if}
  </div>
</main>

<style>
  .ficha {
    position: relative;
    overflow: hidden;
    padding-inline: 56px;
  }
  /* El banner pasa por debajo de la cabecera y se funde con el fondo. */
  .fondo {
    position: absolute;
    inset: 0 0 auto 0;
    height: 640px;
    background-color: var(--superficie);
    background-size: cover;
    background-position: center 20%;
    opacity: 0.55;
    mask-image: linear-gradient(to bottom, #000 40%, transparent);
    pointer-events: none;
  }
  .capa {
    position: relative;
  }
  .volver {
    width: 40px;
    padding: 0;
    border-radius: 50%;
    background: rgb(14 14 19 / 0.55);
    font-size: 1.1rem;
  }
  .cabecera {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 36px;
    align-items: start;
    margin: 20px 0 8px;
  }
  .portada-ficha {
    border-radius: var(--radio);
    overflow: hidden;
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.5);
  }
  .datos h1 {
    margin: 0 0 12px;
    font-size: 3.2rem;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .chips li {
    padding: 2px 10px;
    border: 1px solid var(--borde);
    border-radius: 999px;
    background: rgb(14 14 19 / 0.5);
    font-size: 0.85rem;
  }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 16px 0;
  }
  .icono {
    width: 40px;
    padding: 0;
    border-radius: 50%;
    font-size: 1.1rem;
  }
  .estado select {
    min-height: 40px;
  }
  .sinopsis {
    margin: 0 0 4px;
    max-width: 75ch;
    line-height: 1.6;
  }
  .sinopsis.recortada {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .datos .enlace {
    margin-bottom: 12px;
  }
  .filas {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 10px 16px;
    align-items: center;
    margin: 16px 0 0;
    padding-top: 16px;
    border-top: 1px solid var(--borde);
  }
  .filas dt {
    color: var(--texto-suave);
    font-size: 0.85rem;
    font-weight: 500;
  }
  .filas dd {
    margin: 0;
  }
  .relacionadas p {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .barra-episodios {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .cuenta {
    margin-left: 6px;
    color: var(--texto-suave);
    font-weight: 400;
  }
  .idioma {
    display: flex;
    gap: 4px;
  }
  .idioma button:disabled {
    background: var(--acento);
    border-color: var(--acento);
    color: var(--sobre-acento);
    opacity: 1;
  }
  .lista-episodios {
    list-style: none;
    margin: 4px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 20px 16px;
  }
  /* Con series de cientos de episodios, el navegador solo pinta las filas que se ven. */
  .episodio {
    position: relative;
    content-visibility: auto;
    contain-intrinsic-size: auto 160px;
  }
  .fila {
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .fila:hover:not(:disabled) {
    background: none;
  }
  .fila:hover:not(:disabled) .miniatura,
  .fila:focus-visible .miniatura,
  .episodio.actual .miniatura {
    outline: 2px solid var(--acento);
    outline-offset: 2px;
  }
  .miniatura {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: var(--radio);
  }
  .episodio.visto .miniatura :global(img),
  .episodio.visto .miniatura :global(.portada) {
    opacity: 0.75;
  }
  .marca {
    position: absolute;
    right: 8px;
    top: 8px;
    width: 22px;
    height: 22px;
    padding: 3px;
    box-sizing: border-box;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.7);
    fill: none;
    stroke: #fff;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .miniatura progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 4px;
    appearance: none;
    border: 0;
    background: rgb(0 0 0 / 0.6);
  }
  .miniatura progress::-webkit-progress-bar {
    background: rgb(0 0 0 / 0.6);
  }
  .miniatura progress::-webkit-progress-value {
    background: var(--acento);
  }
  .info {
    display: grid;
    gap: 2px;
  }
  .info span {
    color: var(--texto-suave);
    font-size: 0.9rem;
  }
  .episodio.visto strong {
    color: var(--texto-suave);
  }
  .quitar {
    position: absolute;
    top: 8px;
    left: 8px;
    min-height: 0;
    padding: 0 8px;
    background: rgb(0 0 0 / 0.7);
    opacity: 0;
    transition: opacity 150ms;
  }
  .episodio:hover .quitar,
  .episodio:focus-within .quitar {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .quitar {
      transition: none;
    }
  }
</style>
