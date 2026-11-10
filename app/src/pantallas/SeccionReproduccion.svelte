<script lang="ts">
  import FilaAjuste from '../lib/componentes/FilaAjuste.svelte';
  import { ajustes, guardarAjusteSilencioso } from '../lib/ajustes.svelte.ts';
  import { LIMITES } from '../lib/ajustes.ts';
  import { validarSalto } from '../lib/continuar.ts';
  import { SALTO_CORTO_S, SALTO_LARGO_S } from '../lib/saltos.ts';

  let corto = $state(String(ajustes.saltoCorto));
  let largo = $state(String(ajustes.saltoLargo));

  const cortoOk = $derived(validarSalto(corto, ...LIMITES.saltoCorto));
  const largoOk = $derived(validarSalto(largo, ...LIMITES.saltoLargo));

  // Se guarda al instante, pero solo cuando el valor es válido.
  function cambiarCorto() {
    if (cortoOk === null) return;
    ajustes.saltoCorto = cortoOk;
    guardarAjusteSilencioso('salto_corto', String(cortoOk));
  }

  function cambiarLargo() {
    if (largoOk === null) return;
    ajustes.saltoLargo = largoOk;
    guardarAjusteSilencioso('salto_largo', String(largoOk));
  }

  // Al salir del campo con un valor inválido, vuelve el último guardado.
  function alSalirCorto() {
    if (cortoOk === null) corto = String(ajustes.saltoCorto);
  }

  function alSalirLargo() {
    if (largoOk === null) largo = String(ajustes.saltoLargo);
  }

  function restablecer() {
    corto = String(SALTO_CORTO_S);
    largo = String(SALTO_LARGO_S);
    ajustes.saltoCorto = SALTO_CORTO_S;
    ajustes.saltoLargo = SALTO_LARGO_S;
    guardarAjusteSilencioso('salto_corto', String(SALTO_CORTO_S));
    guardarAjusteSilencioso('salto_largo', String(SALTO_LARGO_S));
  }

  function elegirIdiomaDefecto(v: string) {
    ajustes.idiomaDefecto = v === 'DUB' ? 'DUB' : 'SUB';
    guardarAjusteSilencioso('idioma_defecto', ajustes.idiomaDefecto === 'DUB' ? '1' : '0');
  }
</script>

<h2>Reproducción</h2>

<FilaAjuste id="salto-corto" titulo="Salto corto" ayuda="Segundos del salto normal. Entre {LIMITES.saltoCorto[0]} y {LIMITES.saltoCorto[1]}.">
  <input
    id="salto-corto"
    class="numero"
    bind:value={corto}
    oninput={cambiarCorto}
    onblur={alSalirCorto}
    inputmode="numeric"
    aria-invalid={cortoOk === null}
    aria-describedby="salto-corto-ayuda"
  />
  <span class="unidad">s</span>
</FilaAjuste>

<FilaAjuste id="salto-largo" titulo="Salto largo" ayuda="Segundos del salto grande. Entre {LIMITES.saltoLargo[0]} y {LIMITES.saltoLargo[1]}.">
  <input
    id="salto-largo"
    class="numero"
    bind:value={largo}
    oninput={cambiarLargo}
    onblur={alSalirLargo}
    inputmode="numeric"
    aria-invalid={largoOk === null}
    aria-describedby="salto-largo-ayuda"
  />
  <span class="unidad">s</span>
</FilaAjuste>

<div class="pie">
  <button onclick={restablecer}>Restablecer saltos ({SALTO_CORTO_S} y {SALTO_LARGO_S} s)</button>
</div>

<FilaAjuste
  id="idioma-defecto"
  titulo="Idioma por defecto"
  ayuda="Solo para las series en las que todavía no elegiste uno; lo que elegiste por serie manda."
>
  <select id="idioma-defecto" value={ajustes.idiomaDefecto} onchange={(e) => elegirIdiomaDefecto(e.currentTarget.value)}>
    <option value="SUB">SUB</option>
    <option value="DUB">DUB</option>
  </select>
</FilaAjuste>

<style>
  .numero {
    width: 72px;
    text-align: right;
    color: var(--texto);
  }
  .unidad {
    color: var(--texto-suave);
  }
  input[aria-invalid='true'] {
    outline: 2px solid #e53935;
  }
  .pie {
    display: flex;
    justify-content: flex-end;
    padding: 12px 0 16px;
    border-bottom: 1px solid var(--borde);
  }
</style>
