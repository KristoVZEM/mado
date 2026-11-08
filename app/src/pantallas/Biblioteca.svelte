<script lang="ts">
  import { onMount } from 'svelte';
  import { irA } from '../lib/navegacion.svelte.ts';
  import { estadoDatos, listarBiblioteca, type Biblioteca, type EntradaBiblioteca } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import {
    entradasDe,
    muestraEstado,
    nombreEstado,
    PESTANAS,
    recuentos,
    textoUltimoVisto,
    textoVacio,
    type Pestana,
  } from '../lib/biblioteca.ts';

  let biblioteca = $state<Biblioteca | null>(null);
  let cargando = $state(true);
  let avisoDatos = $state('');
  let error = $state('');
  let pestana = $state<Pestana>('todos');

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

  function abrir(e: EntradaBiblioteca) {
    irA({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla">
  <button onclick={() => irA({ tipo: 'buscar' })}>← Volver</button>
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
        <button aria-pressed={pestana === p.id} onclick={() => (pestana = p.id)}>{p.nombre} ({cuentas[p.id]})</button>
      {/each}
    </div>
    {#if lista.length === 0}
      <p>{textoVacio(pestana)}</p>
    {:else}
      <ul class="lista">
        {#each lista as e (e.aid)}
          {@const ultimo = textoUltimoVisto(e.ultimoEpisodio)}
          <li>
            <button onclick={() => abrir(e)}>
              <strong>{e.titulo}</strong>
              {#if muestraEstado(pestana)}<span>{nombreEstado(e.estado)}</span>{/if}
              {#if ultimo}<span>{ultimo}</span>{/if}
            </button>
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
  .lista {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
    max-width: 640px;
  }
  .lista button {
    width: 100%;
    display: grid;
    gap: 2px;
    text-align: left;
  }
</style>
