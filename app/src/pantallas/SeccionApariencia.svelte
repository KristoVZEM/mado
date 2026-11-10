<script lang="ts">
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { ajustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';

  function elegirOrden(v: string) {
    ajustes.ordenDescendente = v === 'desc';
    guardarAjusteSilencioso('orden_episodios', ajustes.ordenDescendente ? '1' : '0');
  }
</script>

<h2>Apariencia</h2>

<FilaAjuste id="orden" titulo="Orden de los episodios" ayuda="Cómo se listan los episodios en la ficha de cada serie.">
  <select id="orden" value={ajustes.ordenDescendente ? 'desc' : 'asc'} onchange={(e) => elegirOrden(e.currentTarget.value)}>
    <option value="asc">Del primero al último</option>
    <option value="desc">Del último al primero</option>
  </select>
</FilaAjuste>
