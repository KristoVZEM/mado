<script lang="ts">
  import { ajustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { LIMITES } from '../lib/ajustes.ts';
  import { validarSalto } from '../lib/continuar.ts';
  import { SALTO_CORTO_S, SALTO_LARGO_S } from '../lib/saltos.ts';

  let { cerrar }: { cerrar: () => void } = $props();

  let corto = $state(String(ajustes.saltoCorto));
  let largo = $state(String(ajustes.saltoLargo));

  const cortoOk = $derived(validarSalto(corto, ...LIMITES.saltoCorto));
  const largoOk = $derived(validarSalto(largo, ...LIMITES.saltoLargo));

  function guardar() {
    if (cortoOk === null || largoOk === null) return;
    ajustes.saltoCorto = cortoOk;
    ajustes.saltoLargo = largoOk;
    guardarAjusteSilencioso('salto_corto', String(cortoOk));
    guardarAjusteSilencioso('salto_largo', String(largoOk));
    cerrar();
  }

  function restablecer() {
    corto = String(SALTO_CORTO_S);
    largo = String(SALTO_LARGO_S);
  }
</script>

<section class="ajustes" aria-label="Ajustes">
  <h2>Ajustes</h2>
  <label>
    Salto corto (s, {LIMITES.saltoCorto[0]}–{LIMITES.saltoCorto[1]})
    <input bind:value={corto} inputmode="numeric" aria-invalid={cortoOk === null} />
  </label>
  <label>
    Salto largo (s, {LIMITES.saltoLargo[0]}–{LIMITES.saltoLargo[1]})
    <input bind:value={largo} inputmode="numeric" aria-invalid={largoOk === null} />
  </label>
  <div class="acciones">
    <button onclick={guardar} disabled={cortoOk === null || largoOk === null}>Guardar</button>
    <button onclick={restablecer}>Restablecer</button>
    <button onclick={cerrar}>Cancelar</button>
  </div>
</section>

<style>
  .ajustes {
    display: grid;
    gap: 8px;
    max-width: 320px;
    margin: 12px 0;
  }
  label {
    display: grid;
    gap: 4px;
  }
  input[aria-invalid='true'] {
    outline: 2px solid #e53935;
  }
  .acciones {
    display: flex;
    gap: 6px;
  }
</style>
