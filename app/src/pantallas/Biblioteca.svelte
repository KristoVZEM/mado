<script lang="ts">
  import { onMount } from 'svelte';
  import { abrir, nav } from '../lib/navegacion.svelte.ts';
  import {
    estadoDatos,
    listarBiblioteca,
    resumenesVinculados,
    type Biblioteca,
    type EntradaBiblioteca,
    type ResumenSerie,
  } from '../lib/datos.ts';
  import { etiquetaNuevo } from '../lib/destacado.ts';
  import { textoDeError } from '../lib/errores.ts';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import {
    entradasDe,
    nombreEstado,
    PESTANAS,
    recuentos,
  } from '../lib/biblioteca.ts';

  let biblioteca = $state<Biblioteca | null>(null);
  let resumenes = $state<ResumenSerie[]>([]);
  const porAid = $derived(new Map(resumenes.map((r) => [r.aid, r])));
  let cargando = $state(true);
  let avisoDatos = $state('');
  let error = $state('');
  const pestana = $derived(nav.pestana);

  const cuentas = $derived(biblioteca ? recuentos(biblioteca) : null);
  const lista = $derived(biblioteca ? entradasDe(biblioteca, pestana) : []);

  onMount(async () => {
    try {
      avisoDatos = (await estadoDatos()) ?? '';
      if (!avisoDatos) {
        biblioteca = await listarBiblioteca();
        // Extra opcional: si falla, simplemente no hay marcas «Nuevo».
        resumenes = await resumenesVinculados().catch((e) => {
          console.error(e);
          return [];
        });
      }
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
    <Esqueleto variante="cuadricula" cantidad={12} />
  {:else if error}
    <p class="error" role="alert">{error}</p>
  {:else if cuentas}
    <div class="filtros" role="group" aria-label="Estado">
      {#each PESTANAS as p (p.id)}
        <button aria-pressed={pestana === p.id} onclick={() => (nav.pestana = p.id)}>{p.nombre} ({cuentas[p.id]})</button>
      {/each}
    </div>
    {#if lista.length === 0}
      <Vacio titulo="Sin series" texto="" />
    {:else}
      <ul class="cuadricula">
        {#each lista as e (e.aid)}
          {@const ultimo = e.ultimoEpisodio !== null ? `Ep. ${e.ultimoEpisodio}` : null}
          {@const partes = [pestana === 'todos' ? nombreEstado(e.estado) : '', ultimo ?? ''].filter(Boolean)}
          <li>
            <TarjetaPoster aid={e.aid} titulo={e.titulo} subtitulo={partes.join(' · ')}
              etiqueta={etiquetaNuevo(porAid.get(e.aid), e.ultimoEpisodio)}
              alAbrir={() => abrirFicha(e)} />
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
