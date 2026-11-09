<script lang="ts">
  import { onMount } from 'svelte';
  import FilaDesplazable from '../lib/componentes/FilaDesplazable.svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import { entradasDe, nombreEstado } from '../lib/biblioteca.ts';
  import { MIN_BUSQUEDA, seriesDeBiblioteca } from '../lib/busquedaLocal.ts';
  import { listarBiblioteca, type EntradaBiblioteca } from '../lib/datos.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { avisarFalloDeFuente, fuenteRecuperada } from '../lib/fuente.svelte.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import { LISTADOS, sinRepetidos, tituloDe } from '../lib/listados.ts';
  import { abrir, nav } from '../lib/navegacion.svelte.ts';

  /** Cada página de la fuente trae 20 series. */
  const POR_PAGINA = 20;

  let cargando = $state(false);
  let error = $state('');
  let cargandoFilas = $state(false);
  let cargandoMas = $state(false);
  let errorListado = $state('');
  let entrada = $state<HTMLInputElement | null>(null);
  let biblioteca = $state<EntradaBiblioteca[]>([]);
  /** Para descartar respuestas de una búsqueda anterior cuando ya se escribió otra cosa. */
  let ultimaBusqueda = 0;
  let temporizador: ReturnType<typeof setTimeout> | undefined;

  const RETARDO_MS = 300;
  const consulta = $derived(nav.catalogo.texto.trim());
  /** Tus series que coinciden: salen al instante, sin esperar a la fuente. */
  const propias = $derived(consulta.length >= MIN_BUSQUEDA ? seriesDeBiblioteca(consulta, biblioteca) : []);
  const deLaFuente = $derived.by(() => {
    const mias = new Set(propias.map((p) => p.aid));
    return nav.catalogo.resultados.filter((r) => !mias.has(r.aid));
  });

  /** Buscando, con resultados de una búsqueda o con un error de búsqueda: se ve la cuadrícula de resultados. */
  const modoBusqueda = $derived(
    consulta.length >= MIN_BUSQUEDA || nav.catalogo.buscado || nav.catalogo.pendiente || cargando || error !== '',
  );

  /** Ctrl+K (o abrir el Catálogo con el atajo): el cursor va al campo y el texto queda seleccionado. */
  let enfoqueVisto = nav.catalogo.enfoque;
  $effect(() => {
    const n = nav.catalogo.enfoque;
    if (n === enfoqueVisto || !entrada) return;
    enfoqueVisto = n;
    entrada.focus();
    entrada.select();
  });

  onMount(async () => {
    void listarBiblioteca()
      .then((b) => (biblioteca = entradasDe(b, 'todos')))
      .catch((e) => console.error(e));
    if (nav.catalogo.enfoque > 0) {
      enfoqueVisto = nav.catalogo.enfoque;
      entrada?.focus();
      entrada?.select(); // si quedó una búsqueda anterior, escribir la sustituye
    }
    if (nav.catalogo.pendiente) {
      nav.catalogo.pendiente = false;
      await ejecutarBusqueda();
      return;
    }
    await cargarFilas();
  });

  async function ejecutarBusqueda() {
    const texto = nav.catalogo.texto.trim();
    if (!texto) return;
    clearTimeout(temporizador);
    const numero = ++ultimaBusqueda;
    cargando = true;
    error = '';
    nav.catalogo.abierto = null;
    try {
      const r = await fuentes.buscar(texto);
      if (numero !== ultimaBusqueda) return;
      nav.catalogo.resultados = r;
      nav.catalogo.buscado = true;
      fuenteRecuperada();
    } catch (e) {
      if (numero !== ultimaBusqueda) return;
      console.error(e);
      error = mensajeDeError(e);
      avisarFalloDeFuente(e);
      nav.catalogo.resultados = [];
    } finally {
      if (numero === ultimaBusqueda) cargando = false;
    }
  }

  /** Busca al escribir, 300 ms después de la última letra; con menos de 2 letras vuelven las filas. */
  function alEscribir() {
    clearTimeout(temporizador);
    ultimaBusqueda++;
    if (consulta.length < MIN_BUSQUEDA) {
      cargando = false;
      error = '';
      nav.catalogo.buscado = false;
      nav.catalogo.resultados = [];
      void cargarFilas();
      return;
    }
    cargando = true;
    temporizador = setTimeout(() => void ejecutarBusqueda(), RETARDO_MS);
  }

  function buscar(evento: SubmitEvent) {
    evento.preventDefault();
    void ejecutarBusqueda();
  }

  /** Carga las filas que falten, todas a la vez; una que falle no tapa a las demás. */
  async function cargarFilas() {
    const faltan = LISTADOS.filter((l) => !nav.catalogo.listados[l.id]);
    if (faltan.length === 0) return;
    cargandoFilas = true;
    errorListado = '';
    const respuestas = await Promise.allSettled(faltan.map((l) => fuentes.catalogo(l.opciones)));
    let fallo: unknown;
    respuestas.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const resultados = sinRepetidos([], r.value);
        nav.catalogo.listados[faltan[i].id] = { resultados, pagina: 1, fin: r.value.length < POR_PAGINA };
      } else {
        fallo = r.reason;
      }
    });
    if (fallo !== undefined) {
      console.error(fallo);
      errorListado = mensajeDeError(fallo);
      avisarFalloDeFuente(fallo);
    } else {
      fuenteRecuperada();
    }
    cargandoFilas = false;
  }

  async function cargarMas() {
    const id = nav.catalogo.abierto;
    const actual = id ? nav.catalogo.listados[id] : undefined;
    const definicion = LISTADOS.find((l) => l.id === id);
    if (!id || !actual || !definicion || actual.fin || cargandoMas) return;
    cargandoMas = true;
    errorListado = '';
    try {
      const pagina = actual.pagina + 1;
      const mas = await fuentes.catalogo({ ...definicion.opciones, pagina });
      const unidos = sinRepetidos(actual.resultados, mas);
      // Si la página no aporta nada nuevo, no quedan más.
      nav.catalogo.listados[id] = {
        resultados: unidos,
        pagina,
        fin: mas.length < POR_PAGINA || unidos.length === actual.resultados.length,
      };
      fuenteRecuperada();
    } catch (e) {
      console.error(e);
      errorListado = mensajeDeError(e);
      avisarFalloDeFuente(e);
    } finally {
      cargandoMas = false;
    }
  }

  function volverAlCatalogo() {
    nav.catalogo.buscado = false;
    nav.catalogo.resultados = [];
    nav.catalogo.texto = '';
    nav.catalogo.abierto = null;
    error = '';
    void cargarFilas();
  }

  const abierto = $derived(nav.catalogo.abierto ? nav.catalogo.listados[nav.catalogo.abierto] : undefined);
</script>

<main class="pantalla">
  <h1>Catálogo</h1>
  <form class="buscador" role="search" onsubmit={buscar}>
    <svg class="lupa" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5" /></svg>
    <input
      bind:this={entrada}
      bind:value={nav.catalogo.texto}
      oninput={alEscribir}
      placeholder="Busca una serie por su título"
      aria-label="Buscar anime"
      autocomplete="off"
      spellcheck="false"
    />
    {#if nav.catalogo.texto}
      <button type="button" class="borrar" aria-label="Borrar la búsqueda" onclick={volverAlCatalogo}>✕</button>
    {/if}
  </form>

  {#if modoBusqueda}
    {#if cargando || nav.catalogo.pendiente}<p class="estado" role="status">Buscando…</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if propias.length > 0}
      <h2>En tu biblioteca</h2>
      <ul class="cuadricula">
        {#each propias as p (p.aid)}
          <li>
            <TarjetaPoster
              aid={p.aid}
              titulo={p.titulo}
              subtitulo={nombreEstado(p.estado)}
              alAbrir={() => abrir({ tipo: 'ficha', anime: { aid: p.aid, slug: p.slug, title: p.titulo } })}
            />
          </li>
        {/each}
      </ul>
    {/if}
    {#if nav.catalogo.buscado && !cargando && !error && nav.catalogo.resultados.length === 0 && propias.length === 0}
      <Vacio titulo="Sin resultados" texto="Prueba con otro título, con el nombre en romaji o con una sola palabra." />
    {/if}
    {#if deLaFuente.length > 0}
      {#if propias.length > 0}<h2>En animeav1</h2>{/if}
      <ul class="cuadricula">
        {#each deLaFuente as r (r.aid)}
          <li><TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} /></li>
        {/each}
      </ul>
    {/if}
  {:else if nav.catalogo.abierto}
    <div class="encabezado-lista">
      <button onclick={() => (nav.catalogo.abierto = null)}>← Volver</button>
      <h2>{tituloDe(nav.catalogo.abierto)}</h2>
    </div>
    <ul class="cuadricula">
      {#each abierto?.resultados ?? [] as r (r.aid)}
        <li><TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} /></li>
      {/each}
    </ul>
    {#if errorListado}<p class="error" role="alert">{errorListado}</p>{/if}
    {#if abierto && !abierto.fin}
      <p><button onclick={cargarMas} disabled={cargandoMas}>{cargandoMas ? 'Cargando…' : 'Cargar más'}</button></p>
    {/if}
  {:else}
    {#each LISTADOS as l (l.id)}
      {@const datos = nav.catalogo.listados[l.id]}
      <section aria-label={l.titulo} aria-busy={!datos && cargandoFilas}>
        {#if datos}
          <FilaDesplazable
            etiqueta={l.titulo}
            titulo={l.titulo}
            verTodo={{ texto: 'Ver todo', alPulsar: () => (nav.catalogo.abierto = l.id) }}
          >
            {#each datos.resultados as r (r.aid)}
              <li class="poster">
                <TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} />
              </li>
            {/each}
          </FilaDesplazable>
        {:else}
          <h2 class="titulo-fila">{l.titulo}</h2>
          {#if cargandoFilas}<Esqueleto variante="poster" cantidad={8} />{/if}
        {/if}
      </section>
    {/each}
    {#if errorListado}
      <p class="error" role="alert">{errorListado}</p>
      <p><button onclick={cargarFilas} disabled={cargandoFilas}>Reintentar</button></p>
    {/if}
  {/if}
</main>

<style>
  .buscador {
    position: relative;
    max-width: 560px;
    margin: 0 0 32px;
  }
  .buscador input {
    width: 100%;
    min-height: 44px;
    padding: 0 44px;
    border-radius: 999px;
    font-size: 1rem;
  }
  .lupa {
    position: absolute;
    top: 50%;
    left: 16px;
    width: 18px;
    height: 18px;
    transform: translateY(-50%);
    fill: none;
    stroke: var(--texto-suave);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .borrar {
    position: absolute;
    top: 50%;
    right: 6px;
    width: 32px;
    min-height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    transform: translateY(-50%);
  }
  section + section {
    margin-top: 32px;
  }
  .titulo-fila,
  .encabezado-lista h2 {
    margin: 0 0 12px;
    font-size: 1.5rem;
  }
  .encabezado-lista {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  .encabezado-lista h2 {
    margin: 0;
  }
  .estado {
    color: var(--texto-suave);
  }
  .poster {
    flex: 0 0 var(--ancho-poster);
  }
</style>
