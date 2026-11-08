<script lang="ts">
  import Armazon from './Armazon.svelte';
  import Ajustes from './pantallas/Ajustes.svelte';
  import Biblioteca from './pantallas/Biblioteca.svelte';
  import Catalogo from './pantallas/Catalogo.svelte';
  import Inicio from './pantallas/Inicio.svelte';
  import Historial from './pantallas/Historial.svelte';
  import Ficha from './pantallas/Ficha.svelte';
  import Reproductor from './pantallas/Reproductor.svelte';
  import { nav } from './lib/navegacion.svelte.ts';
</script>

{#if nav.superior?.tipo === 'reproducir'}
  {#key nav.superior.numero}
    <Reproductor
      anime={nav.superior.anime}
      numeros={nav.superior.numeros}
      numero={nav.superior.numero}
      idioma={nav.superior.idioma}
    />
  {/key}
{:else}
  <Armazon>
    {#if nav.superior?.tipo === 'ficha'}
      {#key nav.superior.anime.aid}
        <Ficha anime={nav.superior.anime} />
      {/key}
    {:else if nav.seccion === 'inicio'}
      <Inicio />
    {:else if nav.seccion === 'catalogo'}
      <Catalogo />
    {:else if nav.seccion === 'biblioteca'}
      <Biblioteca />
    {:else if nav.seccion === 'historial'}
      <Historial />
    {:else if nav.seccion === 'ajustes'}
      <Ajustes />
    {/if}
  </Armazon>
{/if}
