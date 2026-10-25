<script lang="ts">
let { word = "test" } = $props();

let letters = $derived(word.split(""));
</script>

<div class="wallpaper" aria-hidden="true">
  {#each letters as letter, i}
    <span class="letter" >{letter}</span>
  {/each}
</div>

<style>
.wallpaper {
  position: absolute;
  inset: 0;

  display: flex;
  justify-content: center;
  align-items: center;

  pointer-events: none;
  user-select: none;
  overflow: hidden;

  font-size: min(10vw, 25vh, 30rem);
  font-weight: 800;
  font-family: monospace;
  text-transform: uppercase;
  color: hsla(229, 88%, 50%, 0.15);

  white-space: nowrap;
  gap: 0.1em;
  z-index: 0;

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
  .wallpaper {
    animation: none;
  }
}
</style>
