<script lang="ts">
let { word = "test" } = $props();

let container: HTMLDivElement;
let fontSize = $state(16);

let letters = $derived(word.split(""));

$effect(() => {
  if (!container) return;

  const resizeObserver = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width;
    const height = entry.contentRect.height;

    if (!width || !height) return;

    // Texten ska uppta ca 70 % av fönstrets bredd.
    const targetWidth = width * 0.7;

    // Monospace-tecken är ungefär 0.6em breda.
    const calculatedSize = targetWidth / Math.max(word.length * 0.6, 1);

    // Begränsa storleken även utifrån fönstrets höjd.
    fontSize = Math.min(calculatedSize, height * 0.7);
  });

  resizeObserver.observe(container);

  return () => resizeObserver.disconnect();
});
</script>

<div class="wallpaper" bind:this={container} aria-hidden="true">
  <div
    class="word"
    style:font-size="{fontSize}px"
  >
    {#each letters as letter, i}
      <span class="letter" key={i}>{letter}</span>
    {/each}
  </div>
</div>

<style>
.wallpaper {
  position: absolute;
  inset: 0;

  display: flex;
  justify-content: center;
  align-items: center;

  overflow: hidden;
  pointer-events: none;
  user-select: none;

  z-index: -1;
}

.word {
  display: flex;
  gap: 0.1em;

  font-weight: 800;
  font-family: monospace;
  text-transform: uppercase;
  white-space: nowrap;

  color: hsla(229, 88%, 50%, 0.15);

  transform-origin: center;
  animation: floatRotate 14s ease-in-out infinite alternate;
}

.letter {
  display: inline-block;
}

@keyframes floatRotate {
  from {
    transform: translate(0, 0) rotate(-30deg);
  }

  to {
    transform: translate(8px, -6px) rotate(20deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .word {
    animation: none;
  }
}
</style>
