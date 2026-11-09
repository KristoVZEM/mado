<script lang="ts">
  import { onMount } from 'svelte';
  import { abrir, irASeccion, nav } from '../lib/navegacion.svelte.ts';
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
    muestraEstado,
    nombreEstado,
    PESTANAS,
    recuentos,
    textoUltimoVisto,
    estadoVacio,
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
    <div class="pestanas">
      {#each PESTANAS as p (p.id)}
        <button aria-pressed={pestana === p.id} onclick={() => (nav.pestana = p.id)}>{p.nombre} ({cuentas[p.id]})</button>
      {/each}
    </div>
    {#if lista.length === 0}
      {@const vacio = estadoVacio(pestana)}
      <Vacio titulo={vacio.titulo} texto={vacio.texto}>
        {#each vacio.acciones as accion (accion)}
          {#if accion === 'catalogo'}
            <button class="principal" onclick={() => irASeccion('catalogo')}>Ir al Catálogo</button>
          {:else}
            <button onclick={() => irASeccion('ajustes')}>Importar copia de Ukiku</button>
          {/if}
        {/each}
      </Vacio>
    {:else}
      <ul class="cuadricula">
        {#each lista as e (e.aid)}
          {@const ultimo = textoUltimoVisto(e.ultimoEpisodio)}
          {@const partes = [muestraEstado(pestana) ? nombreEstado(e.estado) : '', ultimo ?? ''].filter(Boolean)}
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
