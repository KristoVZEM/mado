<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { crearConfirmacion } from '../lib/confirmar.ts';
  import Destacados from '../lib/componentes/Destacados.svelte';
  import Miniatura from '../lib/componentes/Miniatura.svelte';
  import Esqueleto from '../lib/componentes/Esqueleto.svelte';
  import FilaDesplazable from '../lib/componentes/FilaDesplazable.svelte';
  import Vacio from '../lib/componentes/Vacio.svelte';
  import TarjetaPoster from '../lib/componentes/TarjetaPoster.svelte';
  import { ajustes, asegurarAjustes } from '../lib/ajustes.svelte.ts';
  import { parteOculta, type ParteInicio } from '../lib/apariencia.ts';
  import { entradasDe, textoUltimoVisto } from '../lib/biblioteca.ts';
  import { fraccionVista, textoRestante } from '../lib/continuar.ts';
  import {
    continuarViendo,
    descartarProgreso,
    estadoDatos,
    leerMedia,
    listarBiblioteca,
    resumenesVinculados,
    type EntradaBiblioteca,
    type EntradaContinuar,
    type ResumenSerie,
  } from '../lib/datos.ts';
  import {
    conNuevoEpisodio,
    elegirDestacados,
    etiquetaNuevo,
    type Destacado,
    type ItemDestacado,
  } from '../lib/destacado.ts';
  import { popularesDeInicio } from '../lib/popularesInicio.ts';
  import { mensajeDeError, textoDeError } from '../lib/errores.ts';
  import { avisarFalloDeFuente } from '../lib/fuente.svelte.ts';
  import { prepararReproduccion } from '../lib/reanudar.ts';
  import { depsReanudar } from '../lib/reanudarApp.ts';
  import { precargarImagenes, urlsDeInicio } from '../lib/precargaInicio.ts';
  import { debeRefrescar } from '../lib/refrescoInicio.ts';
  import { abrir, irASeccion, nav } from '../lib/navegacion.svelte.ts';

  /** Tope de tarjetas por fila; el resto se ve en Biblioteca. */
  const MAX_FILA = 12;

  let avisoDatos = $state('');
  let error = $state('');
  let pendientes = $state<EntradaContinuar[]>([]);
  let viendo = $state<EntradaBiblioteca[]>([]);
  let considerando = $state<EntradaBiblioteca[]>([]);
  let resumenes = $state<ResumenSerie[]>([]);
  let destacados = $state<ItemDestacado[]>([]);
  // Partes que el usuario ocultó en Ajustes → Apariencia.
  const oculta = (parte: ParteInicio) => parteOculta(ajustes.inicioOcultas, parte);
  const verDestacados = $derived(destacados.length > 0 && !oculta('destacados'));
  const porAid = $derived(new Map(resumenes.map((r) => [r.aid, r])));
  /** Lo que sigues o tienes pendiente y tiene un episodio emitido sin ver; primero lo que estás viendo. */
  const nuevos = $derived(conNuevoEpisodio([...viendo, ...considerando], porAid));
  let cargando = $state(true);
  let abriendo = $state<number | null>(null);

  // Cuándo se pidieron por última vez los datos y si aquello salió mal: al volver a verse la ventana (sobre todo si la app
  // arrancó oculta con Windows, con la red quizá sin lista) se piden otra vez si ya son viejos o si fallaron.
  let ultimoIntentoMs = 0;
  let fallo = false;
  let cargandoAhora = false;

  /** Pide a la descarga de imágenes lo primero que se ve, aunque la ventana esté oculta y `loading="lazy"` espere. */
  function precargar() {
    precargarImagenes(
      urlsDeInicio({
        destacados,
        pendientes,
        nuevos,
        viendo,
        considerando,
        bannerDe: (aid) => porAid.get(aid)?.banner ?? null,
      }),
    );
  }

  function alVolverAVerse() {
    if (document.visibilityState === 'hidden' || cargando || cargandoAhora) return;
    if (!debeRefrescar({ ahora: Date.now(), ultimoIntentoMs, fallo })) return;
    void cargar();
  }

  onMount(async () => {
    document.addEventListener('visibilitychange', alVolverAVerse);
    window.addEventListener('focus', alVolverAVerse);
    await asegurarAjustes();
    await cargar();
  });

  onDestroy(() => {
    document.removeEventListener('visibilitychange', alVolverAVerse);
    window.removeEventListener('focus', alVolverAVerse);
  });

  /** Lee los datos de Inicio: lo local de golpe y, sin esperar, la cabecera con las populares. Sirve para la primera carga y para refrescar. */
  async function cargar() {
    if (cargandoAhora) return;
    cargandoAhora = true;
    ultimoIntentoMs = Date.now();
    fallo = false;
    error = '';
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
        precargar();
        // Sin esperar: buscar las series populares en la fuente tarda y las filas no dependen de ello.
        void cargarDestacados()
          .then((d) => {
            destacados = d;
            fallo = fallo || d.length === 0;
            precargar();
          })
          .catch((e) => {
            fallo = true;
            console.error(e);
          });
      }
    } catch (e) {
      fallo = true;
      console.error(e);
      avisoDatos = mensajeDeError(e);
    } finally {
      fallo = fallo || error !== '' || avisoDatos !== '';
      cargando = false;
      cargandoAhora = false;
    }
  }

  /**
   * La cabecera enseña las series más populares en emisión; si AniList o la fuente no responden, las de tu
   * biblioteca. Si una de las populares ya tiene un episodio a medias, el botón retoma ese episodio.
   */
  async function cargarDestacados(): Promise<ItemDestacado[]> {
    // Mientras se buscan las populares ya se enseña lo de tu biblioteca, para que la cabecera no tarde en salir.
    void deBiblioteca().then((d) => {
      if (destacados.length === 0) destacados = d;
    });
    try {
      // Si la lista guardada estaba vencida, llega ya y la nueva entra en cuanto se termina de rehacer.
      const populares = await popularesDeInicio({
        alRenovar: (nuevas) => {
          destacados = conEpisodioPendiente(nuevas);
          precargar();
        },
      });
      if (populares.length > 0) return conEpisodioPendiente(populares);
    } catch (e) {
      console.error(e);
    }
    return deBiblioteca();
  }

  /** Si una de las populares ya tiene un episodio a medias, el botón retoma ese episodio. */
  function conEpisodioPendiente(populares: ItemDestacado[]): ItemDestacado[] {
    return populares.map((it) => {
      const p = pendientes.find((x) => x.aid === it.destacado.aid);
      return p ? { ...it, destacado: { ...it.destacado, numero: p.numero } } : it;
    });
  }

  async function deBiblioteca(): Promise<ItemDestacado[]> {
    const elegidos = elegirDestacados(pendientes, viendo, resumenes);
    return Promise.all(
      elegidos.map(async (destacado) => ({
        destacado,
        media: await leerMedia(destacado.anilistId).catch(() => null),
      })),
    );
  }

  async function retomar(p: EntradaContinuar) {
    if (abriendo !== null) return;
    abriendo = p.aid;
    error = '';
    try {
      const r = await prepararReproduccion(depsReanudar, p, p.numero);
      abrir({ tipo: 'reproducir', anime: { aid: p.aid, slug: p.slug, title: p.titulo }, ...r });
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      avisarFalloDeFuente(e);
    } finally {
      abriendo = null;
    }
  }

  /** aid de la tarjeta que espera confirmación para quitarse de «Continuar viendo». */
  let quitando = $state<number | null>(null);
  const confirmarQuitar = crearConfirmacion<number>((aid) => (quitando = aid));
  onDestroy(() => confirmarQuitar.cancelar());

  async function descartar(p: EntradaContinuar) {
    // El primer clic solo pide confirmar: el ✕ está pegado a la esquina y es fácil pulsarlo sin querer.
    if (!confirmarQuitar.pedir(p.aid)) return;
    try {
      await descartarProgreso(p.aid);
      pendientes = pendientes.filter((x) => x.aid !== p.aid);
    } catch (e) {
      console.error(e);
      error = textoDeError(e);
    }
  }

  function verTodoSiguiendo() {
    nav.biblioteca.pestana = 'viendo';
    irASeccion('biblioteca');
  }

  function verTodoPendientes() {
    nav.biblioteca.pestana = 'considerando';
    irASeccion('biblioteca');
  }

  /** El botón principal de la cabecera: retoma el episodio a medias; si no hay, abre la Ficha. */
  function continuarDestacado(d: Destacado) {
    const p = d.numero !== null ? pendientes.find((x) => x.aid === d.aid) : undefined;
    if (p) void retomar(p);
    else abrirFichaDe(d);
  }

  function abrirFichaDe(d: Destacado) {
    abrir({ tipo: 'ficha', anime: { aid: d.aid, slug: d.slug, title: d.titulo } });
  }

  function abrirFicha(e: EntradaBiblioteca) {
    abrir({ tipo: 'ficha', anime: { aid: e.aid, slug: e.slug, title: e.titulo } });
  }
</script>

<main class="pantalla inicio" class:con-destacado={verDestacados}>
  <h1 class="solo-lectores">Inicio</h1>

  {#if verDestacados}
    <Destacados
      items={destacados}
      abriendo={abriendo !== null}
      alContinuar={continuarDestacado}
      alAbrirFicha={abrirFichaDe}
    />
  {/if}

  <div class="cuerpo">
    {#if avisoDatos}<p class="error" role="alert">Datos locales no disponibles: {avisoDatos}</p>{/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if cargando}<Esqueleto variante="poster" cantidad={8} />{/if}

    {#if pendientes.length > 0 && !oculta('continuar')}
      <section aria-label="Continuar viendo">
        <FilaDesplazable etiqueta="Continuar viendo" titulo="Continuar viendo">
          {#each pendientes as p (p.aid)}
            {@const fr = fraccionVista(p.posicionS, p.duracionS)}
            <li class="continuar">
              <button class="abrir" disabled={abriendo !== null} onclick={() => retomar(p)}>
                <Miniatura aid={p.aid} titulo={p.titulo} numero={p.numero} progreso={fr} imagen={porAid.get(p.aid)?.banner ?? null} />
                <strong>{p.titulo}</strong>
                <span class="detalle">{abriendo === p.aid ? 'Abriendo…' : textoRestante(p.numero, p.posicionS, p.duracionS)}</span>
              </button>
              <button
                class="x"
                class:confirmando={quitando === p.aid}
                aria-label={quitando === p.aid ? `Confirmar: quitar ${p.titulo} de Continuar viendo` : `Quitar ${p.titulo} de Continuar viendo`}
                onclick={() => descartar(p)}
                onblur={() => confirmarQuitar.cancelar()}>{quitando === p.aid ? '¿Quitar?' : '✕'}</button>
            </li>
          {/each}
        </FilaDesplazable>
      </section>
    {/if}

    {#if nuevos.length > 0 && !oculta('nuevos')}
      <section aria-label="Nuevos episodios">
        <FilaDesplazable etiqueta="Nuevos episodios" titulo="Nuevos episodios">
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

    {#if viendo.length > 0 && !oculta('siguiendo')}
      <section aria-label="Siguiendo">
        <FilaDesplazable
          etiqueta="Siguiendo"
          titulo="Siguiendo"
          verTodo={viendo.length > MAX_FILA ? { texto: 'Ver todo', alPulsar: verTodoSiguiendo } : undefined}
        >
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
      </section>
    {/if}

    {#if considerando.length > 0 && !oculta('pendientes')}
      <section aria-label="Pendientes">
        <FilaDesplazable
          etiqueta="Pendientes"
          titulo="Pendientes"
          verTodo={considerando.length > MAX_FILA ? { texto: 'Ver todo', alPulsar: verTodoPendientes } : undefined}
        >
          {#each considerando.slice(0, MAX_FILA) as e (e.aid)}
            <li class="poster">
              <TarjetaPoster aid={e.aid} titulo={e.titulo} alAbrir={() => abrirFicha(e)} />
            </li>
          {/each}
        </FilaDesplazable>
      </section>
    {/if}

    {#if ajustes.inicioOcultas === 31}
      <Vacio titulo="Inicio está vacío" texto="Ocultaste todas sus partes. Puedes volver a mostrarlas en Ajustes → Apariencia.">
        <button onclick={() => irASeccion('ajustes')}>Ir a Ajustes</button>
      </Vacio>
    {:else if !cargando && !avisoDatos && !error && pendientes.length === 0 && viendo.length === 0 && considerando.length === 0}
      <Vacio titulo="Aquí aparecerá lo que veas" texto="Empieza por elegir una serie, o trae tu historial de Ukiku.">
        <button class="principal" onclick={() => irASeccion('catalogo')}>Ir al Catálogo</button>
        <button onclick={() => irASeccion('ajustes')}>Importar copia de Ukiku</button>
      </Vacio>
    {/if}
  </div>
</main>

<style>
  /* Con cabecera de destacados, la página llega hasta arriba: la cabecera flotante va sobre la imagen. */
  .pantalla.con-destacado {
    padding: 0;
  }
  .cuerpo {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 32px;
    padding: 0 var(--margen) 32px;
  }
  section {
    min-width: 0;
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
  .abrir strong {
    margin-top: 2px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 1rem;
    font-weight: 500;
  }
  .detalle {
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .x {
    position: absolute;
    top: 6px;
    right: 6px;
    min-height: 0;
    padding: 0 6px;
    background: rgb(0 0 0 / 0.78);
    /* Sobre la miniatura la ✕ es blanca en los dos temas. */
    color: #fff;
    opacity: 0;
    transition: opacity 150ms;
  }
  .continuar:hover .x,
  .continuar:focus-within .x,
  .x.confirmando {
    opacity: 1;
  }
  .x.confirmando {
    padding: 0 8px;
    background: var(--acento);
    color: var(--sobre-acento);
  }
  @media (prefers-reduced-motion: reduce) {
    .x {
      transition: none;
    }
  }
</style>
