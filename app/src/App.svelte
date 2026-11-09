<script lang="ts">
  import Armazon from './Armazon.svelte';
  import Ajustes from './pantallas/Ajustes.svelte';
  import Biblioteca from './pantallas/Biblioteca.svelte';
  import Catalogo from './pantallas/Catalogo.svelte';
  import Inicio from './pantallas/Inicio.svelte';
  import Historial from './pantallas/Historial.svelte';
  import Ficha from './pantallas/Ficha.svelte';
  import Reproductor from './pantallas/Reproductor.svelte';
  import { onMount } from 'svelte';
  import { asegurarVinculo } from './lib/anilistServicio.ts';
  import { estadoDatos, pendientesEmparejar } from './lib/datos.ts';
  import { crearEmparejador } from './lib/emparejado.ts';
  import { nav } from './lib/navegacion.svelte.ts';

  const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // Empareja las series con AniList en segundo plano, poco a poco y reanudándose en cada arranque.
  // Todo es opcional: cualquier fallo se queda en la consola y no afecta a la app.
  onMount(() => {
    void (async () => {
      try {
        await dormir(5000); // no competir con el arranque
        if (await estadoDatos()) return;
        await crearEmparejador({
          pendientes: pendientesEmparejar,
          emparejar: async (p) => {
            const r = await asegurarVinculo({ aid: p.aid, slug: p.slug, titulo: p.titulo });
            return r.actual ? 'ok' : 'error';
          },
          pausa: dormir,
          activo: () => !document.hidden,
        }).correr();
      } catch (e) {
        console.error(e);
      }
    })();
  });
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
