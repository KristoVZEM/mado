<script lang="ts">
  import { ajustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { LIMITES } from '../lib/ajustes.ts';
  import { validarSalto } from '../lib/continuar.ts';
  import { SALTO_CORTO_S, SALTO_LARGO_S } from '../lib/saltos.ts';

  import { open } from '@tauri-apps/plugin-dialog';
  import { importarCopia, previsualizarCopia, type ModoImportacion, type ResumenCopia } from '../lib/datos.ts';
  import { textoDeError } from '../lib/errores.ts';
  import { lineasResumen, textoAviso, textoResultado } from '../lib/importar.ts';

  let { cerrar, datosOk, alImportar }: { cerrar: () => void; datosOk: boolean; alImportar: () => void } = $props();

  type Fase =
    | { tipo: 'inicio' }
    | { tipo: 'vista'; carpeta: string; resumen: ResumenCopia; confirmando: boolean }
    | { tipo: 'aplicando' }
    | { tipo: 'listo'; texto: string }
    | { tipo: 'error'; texto: string };
  let fase = $state<Fase>({ tipo: 'inicio' });

  async function elegirCarpeta() {
    try {
      const carpeta = await open({ directory: true, multiple: false, title: 'Elegir la carpeta de la copia de Ukiku' });
      if (!carpeta) return;
      fase = { tipo: 'vista', carpeta, resumen: await previsualizarCopia(carpeta), confirmando: false };
    } catch (e) {
      console.error(e);
      fase = { tipo: 'error', texto: textoDeError(e) };
    }
  }

  function confirmar(confirmando: boolean) {
    if (fase.tipo === 'vista') fase = { ...fase, confirmando };
  }

  async function importar(modo: ModoImportacion) {
    if (fase.tipo !== 'vista') return;
    const { carpeta } = fase;
    fase = { tipo: 'aplicando' };
    try {
      fase = { tipo: 'listo', texto: textoResultado(await importarCopia(carpeta, modo)) };
      alImportar();
    } catch (e) {
      console.error(e);
      fase = { tipo: 'error', texto: textoDeError(e) };
    }
  }

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

  <h3>Importar copia de Ukiku</h3>
  {#if !datosOk}
    <p class="error">Los datos locales no están disponibles; no se puede importar.</p>
  {:else if fase.tipo === 'inicio' || fase.tipo === 'error' || fase.tipo === 'listo'}
    <p>
      Elige la carpeta de tu copia de seguridad de Ukiku (local o de Dropbox). Solo se leen los archivos
      <code>history</code>, <code>following</code> y <code>favs</code>.
    </p>
    <button onclick={elegirCarpeta}>Elegir carpeta…</button>
    {#if fase.tipo === 'error'}<p class="error" role="alert">{fase.texto}</p>{/if}
    {#if fase.tipo === 'listo'}<p role="status">{fase.texto}</p>{/if}
  {:else if fase.tipo === 'vista'}
    <ul class="resumen">
      {#each lineasResumen(fase.resumen) as linea}<li>{linea}</li>{/each}
    </ul>
    {#if fase.confirmando}
      <p class="error" role="alert">{textoAviso('reemplazar', fase.resumen)}</p>
      <div class="acciones">
        <button onclick={() => importar('reemplazar')}>Sí, reemplazar</button>
        <button onclick={() => confirmar(false)}>Cancelar</button>
      </div>
    {:else}
      <p>{textoAviso('mezclar', fase.resumen)}</p>
      <div class="acciones">
        <button onclick={() => importar('mezclar')}>Mezclar</button>
        <button onclick={() => confirmar(true)}>Reemplazar…</button>
        <button onclick={() => (fase = { tipo: 'inicio' })}>Cancelar</button>
      </div>
    {/if}
  {:else}
    <p>Importando…</p>
  {/if}
</section>

<style>
  .ajustes {
    display: grid;
    gap: 8px;
    max-width: 420px;
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
  .resumen {
    margin: 0;
    padding-left: 18px;
  }
</style>
