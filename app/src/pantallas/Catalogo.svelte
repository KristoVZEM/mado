<script lang="ts">
  import { onMount } from 'svelte';
  import FilaDesplazable from '../lib/componentes/FilaDesplazable.svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
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

  /** Buscando, con resultados de una búsqueda o con un error de búsqueda: se ve la cuadrícula de resultados. */
  const modoBusqueda = $derived(nav.catalogo.buscado || nav.catalogo.pendiente || cargando || error !== '');

  onMount(async () => {
    if (nav.catalogo.pendiente) {
      nav.catalogo.pendiente = false;
      await ejecutarBusqueda();
      return;
    }
    await cargarFilas();
  });

  async function ejecutarBusqueda() {
    const consulta = nav.catalogo.texto.trim();
    if (!consulta || cargando) return;
    cargando = true;
    error = '';
    nav.catalogo.abierto = null;
    try {
      nav.catalogo.resultados = await fuentes.buscar(consulta);
      nav.catalogo.buscado = true;
      fuenteRecuperada();
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      avisarFalloDeFuente(e);
      nav.catalogo.resultados = [];
    } finally {
      cargando = false;
    }
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
  <form onsubmit={buscar}>
    <input bind:value={nav.catalogo.texto} placeholder="Buscar anime…" size="40" aria-label="Buscar anime" />
    <button type="submit" disabled={cargando}>Buscar</button>
  </form>

  {#if modoBusqueda}
    <p><button onclick={volverAlCatalogo}>← Volver al catálogo</button></p>
    {#if cargando || nav.catalogo.pendiente}<p role="status">Buscando…</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if nav.catalogo.buscado && !cargando && !error && nav.catalogo.resultados.length === 0}
      <Vacio titulo="Sin resultados" texto="Prueba con otro título, con el nombre en romaji o con una sola palabra." />
    {/if}
    <ul class="cuadricula">
      {#each nav.catalogo.resultados as r (r.aid)}
        <li><TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} /></li>
      {/each}
    </ul>
  {:else if nav.catalogo.abierto}
    <p><button onclick={() => (nav.catalogo.abierto = null)}>← Volver al catálogo</button></p>
    <h2>{tituloDe(nav.catalogo.abierto)}</h2>
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
        <div class="cabecera-fila">
          <h2>{l.titulo}</h2>
          {#if datos}<button class="enlace" onclick={() => (nav.catalogo.abierto = l.id)}>Ver todo</button>{/if}
        </div>
        {#if datos}
          <FilaDesplazable etiqueta={l.titulo}>
            {#each datos.resultados as r (r.aid)}
              <li class="poster">
                <TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} />
              </li>
            {/each}
          </FilaDesplazable>
        {:else if cargandoFilas}
          <Esqueleto variante="poster" cantidad={8} />
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
  .cabecera-fila {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  .poster {
    flex: 0 0 var(--ancho-poster);
  }
</style>
