<script lang="ts">
  import { servidoresElegibles } from '../servidores.ts';

  /**
   * Botón con el servidor actual y un menú para elegir otro. Pide la lista de servidores del episodio al abrir
   * (una vez por `clave`) y avisa al padre de lo elegido; cambiar de servidor de verdad es cosa del padre.
   */
  let {
    servidor,
    calidad,
    clave,
    pedirServidores,
    alElegir,
    ocupado = false,
    abierto = $bindable(false),
  }: {
    /** El servidor que suena ahora (`Playable.servidor`). */
    servidor: string;
    /** Alto del vídeo, para «1080p · HLS». */
    calidad?: number;
    /** Identifica episodio e idioma: si cambia, se vuelve a pedir la lista. */
    clave: string;
    /** Los `server` de los embeds del episodio. */
    pedirServidores: () => Promise<string[]>;
    alElegir: (nombre: string, delEpisodio: string[]) => void;
    /** Deshabilita el botón (cambiando de servidor o de idioma). */
    ocupado?: boolean;
    abierto?: boolean;
  } = $props();

  let contenedor = $state<HTMLElement>();
  // Servidores del episodio para la `clave` actual; `null` = aún no se sabe.
  let lista = $state<string[] | null>(null);
  let claveCargada = '';

  async function alternar() {
    abierto = !abierto;
    if (!abierto) return;
    if (clave === claveCargada && lista !== null) return;
    claveCargada = clave;
    lista = null;
    const pedida = clave;
    try {
      const todos = await pedirServidores();
      if (pedida === claveCargada) lista = todos;
    } catch (e) {
      console.error(e);
      if (pedida === claveCargada) lista = [];
    }
  }

  function elegir(nombre: string) {
    abierto = false;
    if (nombre !== servidor) alElegir(nombre, lista ?? [nombre]);
  }

  function alClicFuera(e: PointerEvent) {
    if (abierto && contenedor && !contenedor.contains(e.target as Node)) abierto = false;
  }
</script>

<svelte:window onpointerdown={alClicFuera} />

<div class="menu-servidor" bind:this={contenedor}>
  <button
    class="etiqueta"
    title="Elegir servidor"
    aria-haspopup="menu"
    aria-expanded={abierto}
    aria-label="Servidor {servidor}. Elegir servidor"
    disabled={ocupado}
    onclick={alternar}>{calidad ? `${calidad}p · ` : ''}{servidor} ▾</button
  >
  {#if abierto}
    <div class="opciones" role="menu">
      {#if lista === null}
        <span class="nota">Buscando servidores…</span>
      {:else}
        {#each servidoresElegibles([servidor, ...lista]) as s (s)}
          <button
            role="menuitemradio"
            aria-checked={s === servidor}
            class:activo={s === servidor}
            onclick={() => elegir(s)}>{s === servidor ? '✓ ' : ''}{s}</button
          >
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .menu-servidor {
    position: relative;
  }
  .etiqueta {
    padding: 2px 8px;
    border: 1px solid #888;
    border-radius: 4px;
    font-size: 12px;
  }
  button.etiqueta {
    background: rgba(0, 0, 0, 0.35);
    color: inherit;
  }
  .opciones {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    background: rgba(0, 0, 0, 0.92);
    border: 1px solid #666;
    border-radius: 6px;
  }
  .opciones button.activo {
    border-color: #fff;
    font-weight: 700;
  }
  .opciones .nota {
    font-size: 12px;
    padding: 2px 6px;
  }
</style>
