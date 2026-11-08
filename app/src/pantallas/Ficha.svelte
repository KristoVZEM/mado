<script lang="ts">
  import { onMount } from 'svelte';
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { irA } from '../lib/navegacion.svelte.ts';
  import type { Ficha, Idioma, ResultadoBusqueda } from '../../../core/src/index.ts';

  let { anime }: { anime: ResultadoBusqueda } = $props();

  let ficha = $state<Ficha | null>(null);
  let cargando = $state(true);
  let error = $state('');
  let idioma = $state<Idioma>('SUB');

  const numeros = $derived(ficha ? ficha.episodes.map((e) => e.number).sort((a, b) => a - b) : []);

  onMount(async () => {
    try {
      ficha = await fuentes.episodios(anime.slug);
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
    } finally {
      cargando = false;
    }
  });

  function reproducir(numero: number) {
    irA({ tipo: 'reproducir', anime, numeros, numero, idioma });
  }
</script>

<main class="pantalla">
  <button onclick={() => irA({ tipo: 'buscar' })}>← Volver</button>
  <h1>{ficha?.title || anime.title}</h1>

  {#if cargando}<p>Cargando episodios…</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if ficha}
    <p>
      Idioma:
      <button disabled={idioma === 'SUB'} onclick={() => (idioma = 'SUB')}>SUB</button>
      <button disabled={idioma === 'DUB'} onclick={() => (idioma = 'DUB')}>DUB</button>
      · {numeros.length} episodios
    </p>
    <div class="episodios">
      {#each numeros as n (n)}
        <button onclick={() => reproducir(n)}>{n}</button>
      {/each}
    </div>
  {/if}
</main>

<style>
  .episodios {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .episodios button {
    min-width: 52px;
  }
</style>
