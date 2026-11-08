<script lang="ts">
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { abrir, nav } from '../lib/navegacion.svelte.ts';
  import { onMount } from 'svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';

  let cargando = $state(false);
  let error = $state('');

  onMount(async () => {
    if (nav.catalogo.pendiente) {
      nav.catalogo.pendiente = false;
      await ejecutarBusqueda();
    }
  });

  async function ejecutarBusqueda() {
    const consulta = nav.catalogo.texto.trim();
    if (!consulta || cargando) return;
    cargando = true;
    error = '';
    try {
      nav.catalogo.resultados = await fuentes.buscar(consulta);
      nav.catalogo.buscado = true;
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      nav.catalogo.resultados = [];
    } finally {
      cargando = false;
    }
  }

  function buscar(evento: SubmitEvent) {
    evento.preventDefault();
    void ejecutarBusqueda();
  }
</script>

<main class="pantalla">
  <h1>Catálogo</h1>
  <form onsubmit={buscar}>
    <input bind:value={nav.catalogo.texto} placeholder="Buscar anime…" size="40" />
    <button type="submit" disabled={cargando}>Buscar</button>
  </form>

  {#if cargando}<p>Buscando…</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if nav.catalogo.buscado && !cargando && !error && nav.catalogo.resultados.length === 0}<p>Sin resultados.</p>{/if}

  <ul class="cuadricula">
    {#each nav.catalogo.resultados as r (r.aid)}
      <li><TarjetaPoster aid={r.aid} titulo={r.title} alAbrir={() => abrir({ tipo: 'ficha', anime: r })} /></li>
    {/each}
  </ul>
</main>
