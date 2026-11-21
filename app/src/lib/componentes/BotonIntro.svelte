<script lang="ts">
  // «Saltar intro»: sin estado propio. El Reproductor decide cuándo se ve y a dónde salta.
  let { visible, alto, alSaltar }: { visible: boolean; alto: boolean; alSaltar: () => void } = $props();
</script>

{#if visible}
  <button class="intro" class:alto onclick={alSaltar}>Saltar intro ▸</button>
{/if}

<style>
  /* Mismo sitio y aspecto que «Siguiente episodio»: nunca coinciden (uno sale al empezar y el otro al acabar). */
  .intro {
    position: absolute;
    right: 24px;
    bottom: 28px;
    padding: 12px 22px;
    border: 1px solid rgba(255, 255, 255, 0.55);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(255, 255, 255, 0.85);
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    transition: bottom 0.2s, background 0.15s, color 0.15s;
  }
  /* Con los controles a la vista se sube para no taparlos. */
  .intro.alto {
    bottom: 110px;
  }
  .intro:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
  }
</style>
