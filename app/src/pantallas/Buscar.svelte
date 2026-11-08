<script lang="ts">
  import { fuentes } from '../lib/fuentes.ts';
  import { mensajeDeError } from '../lib/errores.ts';
  import { irA } from '../lib/navegacion.svelte.ts';
  import type { ResultadoBusqueda } from '../../../core/src/index.ts';

  let texto = $state('');
  let resultados = $state<ResultadoBusqueda[]>([]);
  let cargando = $state(false);
  let error = $state('');
  let buscado = $state(false);

  async function buscar(evento: SubmitEvent) {
    evento.preventDefault();
    const consulta = texto.trim();
    if (!consulta || cargando) return;
    cargando = true;
    error = '';
    try {
      resultados = await fuentes.buscar(consulta);
      buscado = true;
    } catch (e) {
      console.error(e);
      error = mensajeDeError(e);
      resultados = [];
    } finally {
      cargando = false;
    }
  }
</script>

<main class="pantalla">
  <h1>ukiku-pc</h1>
  <form onsubmit={buscar}>
    <input bind:value={texto} placeholder="Buscar anime…" size="40" />
    <button type="submit" disabled={cargando}>Buscar</button>
  </form>

  {#if cargando}<p>Buscando…</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if buscado && !cargando && !error && resultados.length === 0}<p>Sin resultados.</p>{/if}

  <ul class="resultados">
    {#each resultados as r (r.aid)}
      <li><button onclick={() => irA({ tipo: 'ficha', anime: r })}>{r.title}</button></li>
    {/each}
  </ul>
</main>

<style>
  .resultados {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 6px;
    max-width: 640px;
  }
  .resultados button {
    width: 100%;
    text-align: left;
  }
</style>
