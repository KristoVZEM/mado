<script lang="ts">
  import { onMount } from 'svelte';
  import Portada from '../lib/componentes/Portada.svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import FilaDesplazable from '../lib/componentes/FilaDesplazable.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import { ajustes, asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { entradasDe, textoUltimoVisto } from '../lib/biblioteca.ts';
  import { fraccionVista, idiomaGuardado, textoRestante } from '../lib/continuar.ts';
  import {
    continuarViendo,
    descartarProgreso,
    estadoDatos,
    leerAjuste,
    listarBiblioteca,
    resumenesVinculados,
    type EntradaBiblioteca,
    type EntradaContinuar,
    type ResumenSerie,
  } from '../lib/datos.ts';
  import { conNuevoEpisodio, elegirDestacado, etiquetaNuevo } from '../lib/destacado.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { avisarFalloDeFuente } from '../lib/fuente.svelte.ts';
  import { fuentes } from '../lib/fuentes.ts';
  import { abrir, irASeccion, nav } from '../lib/navegacion.svelte.ts';

  /** Tope de tarjetas por fila; el resto se ve en Biblioteca. */
  const MAX_FILA = 20;

  let avisoDatos = $state('');
  let error = $state('');
  let pendientes = $state<EntradaContinuar[]>([]);
  let viendo = $state<EntradaBiblioteca[]>([]);
  let considerando = $state<EntradaBiblioteca[]>([]);
  let resumenes = $state<ResumenSerie[]>([]);
  const destacado = $derived(elegirDestacado(pendientes, viendo, resumenes));
  const porAid = $derived(new Map(resumenes.map((r) => [r.aid, r])));
  /** Lo que sigues y tiene un episodio emitido sin ver. */
  const nuevos = $derived(conNuevoEpisodio(viendo, porAid));
  let cargando = $state(true);
  let abriendo = $state<number | null>(null);

  onMount(async () => {
    await asegurarAjustes();
    try {
      avisoDatos = (await estadoDatos()) ?? '';
      if (!avisoDatos) {
        // Cada fila carga por separado: que falle una no tapa la otra.
        const [c, b, r] = await Promise.allSettled([continuarViendo(12), listarBiblioteca(), resumenesVinculados()]);
        // Los datos de AniList son un extra: si faltan, simplemente no hay cabecera ni marcas.
        if (r.status === 'fulfilled') resumenes = r.value;
        else console.error(r.reason);
        if (c.status === 'fulfilled') pendientes = c.value;
        else error = textoDeError(c.reason);
        if (b.status === 'fulfilled') {
          viendo = entradasDe(b.value, 'viendo');
          considerando = entradasDe(b.value, 'considerando');
        } else {
          error = textoDeError(b.reason);
        }
      }
    } catch (e) {
      console.error(e);
      avisoDatos = mensajeDeError(e);
    } finally {
      cargando = false;
    }
  });

  async function retomar(p: EntradaContinuar) {
    if (abriendo !== null) return;
    abriendo = p.aid;
    error = '';
    try {
      const [ficha, idioma] = await Promise.all([
        fuentes.episodios(p.slug),
        leerAjuste(`idioma:${p.aid}`).catch(() => null),
        asegurarAjustes(),
      ]);
      const numeros = ficha.episodes.map((e) => e.number).sort((a, b) => a - b);
      if (!numeros.includes(p.numero)) throw new Error(`El episodio ${p.numero} ya no está en la lista.`);
      abrir({
        tipo: 'reproducir',
        anime: { aid: p.aid, slug: p.slug, title: p.titulo },
        numeros,
        numero: p.numero,
        idioma: idiomaGuardado(idioma, ajustes.idiomaDefecto),
      });
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      avisarFalloDeFuente(e);
    } finally {
      abriendo = null;
    }
  }

  async function descartar(p: EntradaContinuar) {
    try {
      await descartarProgreso(p.aid);
      pendientes = pendientes.filter((x) => x.aid !== p.aid);
    } catch (e) {
      console.error(e);
      error = textoDeError(e);
    }
  }

  function verTodoSiguiendo() {
    nav.pestana = 'viendo';
    irASeccion('biblioteca');
  }

  function verTodoPendientes() {
    nav.pestana = 'considerando';
    irASeccion('biblioteca');
  }

  function usarDestacado() {
    const d = destacado;
    if (!d) return;
    const p = d.numero !== null ? pendientes.find((x) => x.aid === d.aid) : undefined;
    if (p) void retomar(p);
    else abrir({ tipo: 'ficha', anime: { aid: d.aid, slug: d.slug, title: d.titulo } });
  }

  function abrirFicha(e: EntradaBiblioteca) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla">
  <h1 class="solo-lectores">Inicio</h1>

  {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if cargando}<Esqueleto variante="poster" cantidad={8} />{/if}

  {#if destacado}
    <section
      class="destacado"
      style:background-image={`linear-gradient(90deg, var(--fondo) 5%, transparent 70%), url(${destacado.banner})`}
      aria-label="Destacado"
    >
      <h2>{destacado.titulo}</h2>
      <button class="principal" disabled={abriendo !== null} onclick={usarDestacado}>
        {destacado.numero !== null ? `Continuar Ep. ${destacado.numero}` : 'Ver serie'}
      </button>
    </section>
  {/if}

  {#if pendientes.length > 0}
    <section aria-label="Continuar viendo">
      <h2>Continuar viendo</h2>
      <FilaDesplazable etiqueta="Continuar viendo">
        {#each pendientes as p (p.aid)}
          {@const fr = fraccionVista(p.posicionS, p.duracionS)}
          <li class="continuar">
            <button class="abrir" disabled={abriendo !== null} onclick={() => retomar(p)}>
              <Portada aid={p.aid} titulo={p.titulo} numero={p.numero} />
              <strong>{p.titulo}</strong>
              <span>{abriendo === p.aid ? 'Abriendo…' : textoRestante(p.numero, p.posicionS, p.duracionS)}</span>
              {#if fr !== null}<progress value={fr} max="1"></progress>{/if}
            </button>
            <button class="x" aria-label={`Descartar ${p.titulo}`} onclick={() => descartar(p)}>✕</button>
          </li>
        {/each}
      </FilaDesplazable>
    </section>
  {/if}

  {#if nuevos.length > 0}
    <section aria-label="Nuevos episodios">
      <h2>Nuevos episodios</h2>
      <FilaDesplazable etiqueta="Nuevos episodios">
        {#each nuevos.slice(0, MAX_FILA) as e (e.aid)}
          <li class="poster">
            <TarjetaPoster
              aid={e.aid}
              titulo={e.titulo}
              subtitulo={textoUltimoVisto(e.ultimoEpisodio) ?? undefined}
              etiqueta={etiquetaNuevo(porAid.get(e.aid), e.ultimoEpisodio)}
              alAbrir={() => abrirFicha(e)}
            />
          </li>
        {/each}
      </FilaDesplazable>
    </section>
  {/if}

  {#if viendo.length > 0}
    <section aria-label="Siguiendo">
      <h2>Siguiendo</h2>
      <FilaDesplazable etiqueta="Siguiendo">
        {#each viendo.slice(0, MAX_FILA) as e (e.aid)}
          <li class="poster">
            <TarjetaPoster
              aid={e.aid}
              titulo={e.titulo}
              subtitulo={textoUltimoVisto(e.ultimoEpisodio) ?? undefined}
              etiqueta={etiquetaNuevo(porAid.get(e.aid), e.ultimoEpisodio)}
              alAbrir={() => abrirFicha(e)}
            />
          </li>
        {/each}
      </FilaDesplazable>
      {#if viendo.length > MAX_FILA}
        <button onclick={verTodoSiguiendo}>Ver las {viendo.length} en Biblioteca</button>
      {/if}
    </section>
  {/if}

  {#if considerando.length > 0}
    <section aria-label="Pendientes">
      <h2>Pendientes</h2>
      <FilaDesplazable etiqueta="Pendientes">
        {#each considerando.slice(0, MAX_FILA) as e (e.aid)}
          <li class="poster">
            <TarjetaPoster aid={e.aid} titulo={e.titulo} alAbrir={() => abrirFicha(e)} />
          </li>
        {/each}
      </FilaDesplazable>
      {#if considerando.length > MAX_FILA}
        <button onclick={verTodoPendientes}>Ver las {considerando.length} en Biblioteca</button>
      {/if}
    </section>
  {/if}

  {#if !cargando && !avisoDatos && !error && pendientes.length === 0 && viendo.length === 0 && considerando.length === 0}
    <Vacio titulo="Aquí aparecerá lo que veas" texto="Empieza por elegir una serie, o trae tu historial de Ukiku.">
      <button class="principal" onclick={() => irASeccion('catalogo')}>Ir al Catálogo</button>
      <button onclick={() => irASeccion('ajustes')}>Importar copia de Ukiku</button>
    </Vacio>
  {/if}
</main>

<style>
  .destacado {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 260px;
    padding: 24px;
    margin: 16px 0;
    border-radius: var(--radio);
    background-size: cover;
    background-position: center;
  }
  .destacado h2 {
    margin: 0 0 12px;
    font-size: 1.8rem;
    max-width: 60%;
  }
  .destacado .principal {
    align-self: flex-start;
  }
  .continuar {
    position: relative;
    flex: 0 0 var(--ancho-captura);
  }
  .poster {
    flex: 0 0 var(--ancho-poster);
  }
  .abrir {
    width: 100%;
    display: grid;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .abrir:hover:not(:disabled) {
    background: none;
  }
  .abrir:hover:not(:disabled) :global(.portada),
  .abrir:focus-visible :global(.portada) {
    outline: 2px solid var(--acento);
  }
  .abrir span {
    color: var(--texto-suave);
  }
  .abrir progress {
    width: 100%;
  }
  .x {
    position: absolute;
    top: 6px;
    right: 6px;
    min-height: 0;
    padding: 0 6px;
    background: rgb(0 0 0 / 0.6);
  }
</style>
