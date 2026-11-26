<script lang="ts">
  import { onDestroy } from 'svelte';
  import Menu from './Menu.svelte';
  import { ESTADOS } from '../biblioteca.ts';
  import { crearConfirmacion } from '../confirmar.ts';
  import { textoPrincipal, type Principal } from '../episodiosFicha.ts';

  let {
    titulo,
    estado,
    favorito,
    abierto,
    alAbrir,
    alCerrar,
    cargarPrincipal,
    alReproducir,
    alCambiarEstado,
    alAlternarFavorito,
    alQuitar,
    ocupado = false,
  }: {
    titulo: string;
    estado: number | null;
    favorito: boolean;
    abierto: boolean;
    alAbrir: () => void;
    alCerrar: () => void;
    cargarPrincipal: () => Promise<Principal | null>;
    alReproducir: (numero: number) => void;
    alCambiarEstado: (estado: number) => void;
    alAlternarFavorito: () => void;
    alQuitar: () => void;
    /** Hay algo en curso con esta serie (abriendo un episodio o guardando): las acciones no responden. */
    ocupado?: boolean;
  } = $props();

  let boton = $state<HTMLButtonElement | null>(null);
  /** `undefined` mientras se calcula; `null` si no hay nada que ofrecer (o falló). */
  let principal = $state<Principal | null | undefined>(undefined);

  // Se calcula cada vez que se abre: entre una apertura y otra pudo verse un episodio.
  $effect(() => {
    if (!abierto) return;
    let vigente = true;
    principal = undefined;
    cargarPrincipal().then(
      (p) => {
        if (vigente) principal = p;
      },
      (e) => {
        console.error('menú de la serie: no se pudo calcular el episodio', e);
        if (vigente) principal = null;
      },
    );
    return () => {
      vigente = false;
    };
  });

  let pidiendoQuitar = $state(false);
  const confirmarQuitar = crearConfirmacion<true>((p) => (pidiendoQuitar = p !== null));
  onDestroy(() => confirmarQuitar.cancelar());

  function quitar() {
    if (ocupado) return;
    if (confirmarQuitar.pedir(true)) alQuitar();
  }

  /** Un ítem «ocupado» sigue siendo enfocable (el menú abre con el foco dentro) pero no hace nada. */
  const si = (accion: () => void) => () => {
    if (!ocupado) accion();
  };

  /** Esc cierra el menú (lo hace `Menu`); el foco vuelve al «⋯» para no perderse. */
  function tecla(e: KeyboardEvent) {
    if (e.key === 'Escape' && abierto) queueMicrotask(() => boton?.focus());
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ancla" onkeydown={tecla}>
  <button
    bind:this={boton}
    class="mas"
    aria-haspopup="menu"
    aria-expanded={abierto}
    aria-label={`Opciones de ${titulo}`}
    title="Opciones"
    onclick={() => (abierto ? alCerrar() : alAbrir())}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
  </button>
  <Menu {abierto} derecha etiqueta={`Opciones de ${titulo}`} {alCerrar}>
    {#if principal !== null}
      <!-- Un solo botón en carga y listo: el foco que el menú le da al abrir no se pierde al llegar el episodio. -->
      <button
        role="menuitem"
        aria-disabled={ocupado || principal === undefined}
        onclick={si(() => principal && alReproducir(principal.numero))}
      >
        ▶ {principal ? textoPrincipal(principal) : 'Continuar'}
      </button>
    {/if}
    <hr />
    {#each ESTADOS as e (e.valor)}
      <button role="menuitemradio" aria-checked={estado === e.valor} aria-disabled={ocupado} onclick={si(() => alCambiarEstado(e.valor))}>
        <svg class="marca-menu" viewBox="0 0 24 24" aria-hidden="true">
          {#if estado === e.valor}<path d="M5 12.5l4.5 4.5L19 7.5" />{/if}
        </svg>
        {e.nombre}
      </button>
    {/each}
    <hr />
    <button role="menuitem" aria-disabled={ocupado} onclick={si(alAlternarFavorito)}>{favorito ? '★ Quitar de favoritos' : '☆ Añadir a favoritos'}</button>
    {#if estado !== null}
      <button role="menuitem" class="peligro" aria-disabled={ocupado} onclick={quitar}>
        {pidiendoQuitar ? '¿Quitar? Pulsa otra vez' : 'Quitar de la biblioteca'}
      </button>
    {/if}
  </Menu>
</div>

<style>
  .ancla {
    position: relative;
  }
  .mas {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--borde-control);
    border-radius: var(--radio-control);
    background: rgb(var(--fondo-rgb) / 0.8);
    color: var(--texto);
  }
  .mas:hover:not(:disabled) {
    background: var(--superficie);
  }
  .mas svg {
    width: 16px;
    fill: currentColor;
  }
  hr {
    margin: 4px 0;
    border: 0;
    border-top: 1px solid var(--borde);
  }
  .ancla :global(.peligro) {
    color: var(--error);
  }
  .ancla :global(button[aria-disabled='true']),
  .ancla :global(button[aria-disabled='true']:hover) {
    background: none;
    opacity: 0.5;
    cursor: default;
  }
</style>
