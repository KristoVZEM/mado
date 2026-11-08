<script lang="ts">
  import Buscar from './pantallas/Buscar.svelte';
  import Ficha from './pantallas/Ficha.svelte';
  import { nav } from './lib/navegacion.svelte.ts';
</script>

{#if nav.pantalla.tipo === 'buscar'}
  <Buscar />
{:else if nav.pantalla.tipo === 'ficha'}
  {#key nav.pantalla.anime.aid}
    <Ficha anime={nav.pantalla.anime} />
  {/key}
{:else}
  <main class="pantalla"><p>Reproductor (se añade en la Task 6)</p></main>
{/if}
