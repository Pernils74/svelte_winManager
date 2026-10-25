<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

let { win, winId, parentId }: WindowComponentProps = $props();

import WindowB from "./window_B.svelte";
import WindowC from "./window_C.svelte";

const wManager = getWindowManager();

function refresh() {
  console.log("Uppdatera BOM:", winId);
  // Anropa BOM-specifik uppdatering här.
}

function openWindow_B() {
  wManager.open(WindowB, {
    title: "🪟 Winodw B",
    width: 700,
    height: 600,
  });
}

function openWindow_C() {
  wManager.open(WindowC, {
    title: "🪟 Winodw C",
    width: 700,
    height: 600,
  });
}
</script>

<div class="actions">
  <button onclick={refresh} title="Uppdatera BOM">🔄</button>
  <button onclick={openWindow_B} title="Open Window B">Open 🪟 B </button>
  <button onclick={openWindow_C} title="Open Window C">Open 🪟 C </button>
</div>

<style>
.actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

button {
  cursor: pointer;
  border: 0;
  border-radius: 4px;
  padding: 4px 8px;
  background: #007acc;
  color: white;
}
</style>
