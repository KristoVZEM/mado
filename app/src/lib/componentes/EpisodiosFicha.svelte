<script lang="ts">
  import Portada from './Portada.svelte';
  import { fraccionVista } from '../continuar.ts';
  import { minutosDe, textoQuedan, type ProgresoEp } from '../episodiosFicha.ts';
  import { etiquetaPagina, paginaDe, paginar, seMuestraPaginador } from '../paginasEpisodios.ts';

  // Lista de episodios de la Ficha: cabecera con el paginador y una tarjeta por episodio con su miniatura,
  // marca de visto y progreso. Las series largas se muestran de 24 en 24. El idioma se elige en el reproductor
  // (y se recuerda por serie). No guarda nada: avisa a la Ficha de lo que el usuario pide.
  let {
    aid,
    titulo,
    total,
    mostrados,
    vistos,
    progresoPorNumero,
    principalNumero,
    duracionMedia,
    conCuenta,
    aviso,
    difuminar,
    alReproducir,
    alDesmarcar,
    alMarcarHasta,
  }: {
    aid: number;
    titulo: string;
    // Episodios que tiene la serie (el número junto al encabezado).
    total: number;
    // Números de episodio en el orden en que se muestran.
    mostrados: number[];
    vistos: Set<number>;
    progresoPorNumero: Map<number, ProgresoEp>;
    // El episodio que ofrece el botón grande de la Ficha; se resalta en la lista.
    principalNumero: number | undefined;
    // Duración típica de un episodio según AniList, en minutos.
    duracionMedia: number | null | undefined;
    // Hay cuenta de AniList vinculada: la ayuda del «×» avisa de que puede volver a marcarlo.
    conCuenta: boolean;
    // Mensaje de error al desmarcar un episodio, o vacío.
    aviso: string;
    // Difuminar la captura de los episodios sin ver, para no destripar (el siguiente, los empezados y los vistos no).
    difuminar: boolean;
    alReproducir: (numero: number) => void;
    alDesmarcar: (numero: number) => void;
    // Marcar como visto este episodio y todos los anteriores.
    alMarcarHasta: (numero: number) => void;
  } = $props();

  // Página elegida por el usuario; mientras no toque nada, la lista sigue al episodio principal.
  let elegida = $state<number | null>(null);
  const paginas = $derived(paginar(mostrados));
  const inicial = $derived(Math.max(0, paginaDe(mostrados, principalNumero ?? Number.NaN)));
  const pagina = $derived(Math.min(elegida ?? inicial, Math.max(0, paginas.length - 1)));
  const visibles = $derived(paginas[pagina] ?? []);
  const conPaginador = $derived(seMuestraPaginador(mostrados.length));

  function marcarHasta(n: number) {
    // Al marcar, el episodio principal avanza y, sin esto, la lista saltaría a su página.
    elegida = pagina;
    alMarcarHasta(n);
  }
</script>

<div class="barra-episodios">
  <h2>Episodios <span class="cuenta">{total}</span></h2>
  {#if conPaginador}
    <div class="paginador" role="group" aria-label="Páginas de episodios">
      <button aria-label="Página anterior" disabled={pagina === 0} onclick={() => (elegida = pagina - 1)}>‹</button>
      <select aria-label="Página" value={String(pagina)} onchange={(e) => (elegida = Number(e.currentTarget.value))}>
        {#each paginas as p, i (i)}<option value={String(i)}>{etiquetaPagina(p)}</option>{/each}
      </select>
      <button aria-label="Página siguiente" disabled={pagina >= paginas.length - 1} onclick={() => (elegida = pagina + 1)}>›</button>
    </div>
  {/if}
</div>
<ul class="lista-episodios" aria-label="Episodios">
  <!-- La fuente puede traer números repetidos: la clave lleva la posición para no chocar (each_key_duplicate). -->
  {#each visibles as n, i (`${n}:${i}`)}
    {@const p = progresoPorNumero.get(n)}
    {@const fr = p ? fraccionVista(p.posicionS, p.duracionS) : null}
    {@const quedan = p ? textoQuedan(p.posicionS, p.duracionS) : null}
    <li class="episodio" class:visto={vistos.has(n)} class:actual={principalNumero === n}>
      <button class="fila" onclick={() => alReproducir(n)}>
        <span class="miniatura" data-difuminada={difuminar && !vistos.has(n) && !p && principalNumero !== n ? '' : undefined}>
          <Portada {aid} {titulo} numero={n} />
          <span class="reproducir" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" /></svg>
          </span>
          {#if minutosDe(p, duracionMedia)}<span class="duracion">{minutosDe(p, duracionMedia)} min</span>{/if}
          {#if vistos.has(n)}
            <svg class="marca" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          {/if}
          {#if fr !== null}
            <progress value={fr} max="1" aria-hidden="true"></progress>
          {:else if vistos.has(n)}
            <progress value="1" max="1" aria-hidden="true"></progress>
          {/if}
          <span class="contorno"></span>
        </span>
        <span class="info">
          <strong>Episodio {n}</strong>
          {#if vistos.has(n)}<span>Visto</span>{:else if quedan}<span>{quedan}</span>{:else if principalNumero === n}<span>Siguiente</span>{/if}
        </span>
      </button>
      <div class="acciones">
        {#if !vistos.has(n)}
          <button
            class="hasta"
            onclick={() => marcarHasta(n)}
            aria-label={`Marcar como vistos los episodios hasta el ${n}`}
            title="Marcar como vistos este episodio y todos los anteriores">Visto</button>
        {:else}
          <button
            class="quitar"
            onclick={() => alDesmarcar(n)}
            aria-label={`Marcar el episodio ${n} como no visto`}
            title={conCuenta ? 'Marcar como no visto. AniList puede volver a marcarlo.' : 'Marcar como no visto'}>×</button>
        {/if}
      </div>
    </li>
  {/each}
</ul>
{#if aviso}<p class="error" role="alert">{aviso}</p>{/if}

<style>
  .barra-episodios {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }
  .cuenta {
    margin-left: 6px;
    color: var(--texto-suave);
    font-weight: 400;
  }
  .paginador {
    display: flex;
    gap: 4px;
  }
  .lista-episodios {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px 16px;
  }
  /* Con series de cientos de episodios, el navegador solo pinta las filas que se ven. */
  .episodio {
    position: relative;
    content-visibility: auto;
    contain-intrinsic-size: auto 190px;
  }
  .fila {
    display: grid;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .fila:hover:not(:disabled) {
    background: none;
  }
  .miniatura {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: var(--radio);
  }
  .miniatura :global(img) {
    transition:
      opacity 300ms ease-out,
      transform 300ms ease-out,
      filter 300ms ease-out;
  }
  /* Captura difuminada de un episodio sin ver: el zoom esconde el borde claro que deja el desenfoque. */
  .miniatura[data-difuminada] :global(img) {
    filter: blur(6px);
    transform: scale(1.06);
  }
  .episodio:hover .miniatura[data-difuminada] :global(img),
  .fila:focus-visible .miniatura[data-difuminada] :global(img) {
    filter: none;
    transform: scale(1.05);
  }
  .fila:hover .miniatura :global(img) {
    opacity: 0.75;
    transform: scale(1.05);
  }
  /* Borde fino siempre y, al pasar el ratón o con el foco, un anillo interior. */
  .contorno {
    position: absolute;
    inset: 0;
    border: 1px solid var(--borde);
    border-radius: var(--radio);
    pointer-events: none;
    transition: box-shadow 250ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .fila:hover .contorno,
  .fila:focus-visible .contorno,
  .episodio.actual .contorno {
    box-shadow: inset 0 0 0 1px var(--borde);
  }
  .fila:focus-visible {
    outline: 2px solid var(--anillo);
    outline-offset: 2px;
    border-radius: var(--radio);
  }
  .reproducir {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    place-items: center;
    padding: 16px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.6);
    opacity: 0;
    transform: translate(-50%, -50%);
    transition: opacity 150ms;
    pointer-events: none;
  }
  .reproducir svg {
    width: 24px;
    height: 24px;
    fill: #fff;
  }
  .fila:hover .reproducir,
  .fila:focus-visible .reproducir {
    opacity: 1;
    background: rgb(0 0 0 / 0.75);
  }
  /* Duración: abajo a la derecha, por encima de la barra de progreso. */
  .duracion {
    position: absolute;
    right: 8px;
    bottom: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.7);
    font-size: 0.75rem;
    font-weight: 500;
    pointer-events: none;
  }
  .marca {
    position: absolute;
    left: 8px;
    top: 8px;
    width: 24px;
    height: 24px;
    padding: 5px;
    box-sizing: border-box;
    border-radius: 50%;
    background: #00a63e;
    fill: none;
    stroke: #fff;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .miniatura progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 4px;
    appearance: none;
    border: 0;
    background: #364153;
  }
  .miniatura progress::-webkit-progress-bar {
    background: #364153;
  }
  .miniatura progress::-webkit-progress-value {
    background: var(--acento);
  }
  .info {
    display: grid;
    gap: 2px;
  }
  .info strong {
    font-size: 1rem;
    font-weight: 500;
  }
  .info span {
    color: var(--texto-suave);
    font-size: 0.875rem;
  }
  .acciones {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 150ms;
  }
  .acciones button {
    min-height: 0;
    padding: 0 8px;
    background: rgb(0 0 0 / 0.7);
  }
  .episodio:hover .acciones,
  .episodio:focus-within .acciones {
    opacity: 1;
  }
  :global(.capa) h2 {
    margin: 0;
    font-size: 1.875rem;
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: normal;
  }
  @media (prefers-reduced-motion: reduce) {
    .miniatura :global(img),
    .contorno,
    .reproducir,
    .acciones {
      transition: none;
    }
    .fila:hover .miniatura :global(img) {
      transform: none;
    }
  }
</style>
