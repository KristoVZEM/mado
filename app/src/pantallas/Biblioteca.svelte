<script lang="ts">
  import { onMount } from 'svelte';
  import { abrir, nav } from '../lib/navegacion.svelte.ts';
  import { estadoDatos, listarBiblioteca, type Biblioteca, type EntradaBiblioteca } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import {
    entradasDe,
    muestraEstado,
    nombreEstado,
    PESTANAS,
    recuentos,
    textoUltimoVisto,
    textoVacio,
  } from '../lib/biblioteca.ts';

  let biblioteca = $state<Biblioteca | null>(null);
  let cargando = $state(true);
  let avisoDatos = $state('');
  let error = $state('');
  const pestana = $derived(nav.pestana);

  const cuentas = $derived(biblioteca ? recuentos(biblioteca) : null);
  const lista = $derived(biblioteca ? entradasDe(biblioteca, pestana) : []);

  onMount(async () => {
    try {
      avisoDatos = (await estadoDatos()) ?? '';
      if (!avisoDatos) biblioteca = await listarBiblioteca();
    } catch (e) {
      console.error(e);
      error = textoDeError(e);
    } finally {
      cargando = false;
    }
  });

  function abrirFicha(e: EntradaBiblioteca) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla">
  <h1>Biblioteca</h1>

  {#if avisoDatos}
    <p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>
  {:else if cargando}
    <p>Cargando…</p>
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {:else if cuentas}
    <div class="pestanas">
      {#each PESTANAS as p (p.id)}
        <button aria-pressed={pestana === p.id} onclick={() => (nav.pestana = p.id)}>{p.nombre} ({cuentas[p.id]})</button>
      {/each}
    </div>
    {#if lista.length === 0}
      <p>{textoVacio(pestana)}</p>
    {:else}
      <ul class="cuadricula">
        {#each lista as e (e.aid)}
          {@const ultimo = textoUltimoVisto(e.ultimoEpisodio)}
          {@const partes = [muestraEstado(pestana) ? nombreEstado(e.estado) : '', ultimo ?? ''].filter(Boolean)}
          <li>
            <TarjetaPoster aid={e.aid} titulo={e.titulo} subtitulo={partes.join(' · ')} alAbrir={() => abrirFicha(e)} />
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  .pestanas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
  }
  .pestanas button[aria-pressed='true'] {
    font-weight: bold;
    outline: 2px solid currentColor;
  }
</style>
