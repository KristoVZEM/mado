<script lang="ts">
  import Buscar from './pantallas/Buscar.svelte';
  import Ficha from './pantallas/Ficha.svelte';
  import Reproductor from './pantallas/Reproductor.svelte';
  import { nav } from './lib/navegacion.svelte.ts';
</script>

{#if nav.pantalla.tipo === 'buscar'}
  <Buscar />
{:else if nav.pantalla.tipo === 'ficha'}
  {#key nav.pantalla.anime.aid}
    <Ficha anime={nav.pantalla.anime} />
  {/key}
{:else}
  {#key nav.pantalla.numero}
    <Reproductor
      anime={nav.pantalla.anime}
      numeros={nav.pantalla.numeros}
      numero={nav.pantalla.numero}
      idioma={nav.pantalla.idioma}
    />
  {/key}
{/if}
