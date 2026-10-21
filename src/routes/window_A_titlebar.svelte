<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";

import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

let { win, winId }: WindowComponentProps = $props();

// let { winId }: { winId: string } = $props();

const wManager = getWindowManager();

function refresh() {
  console.log("Uppdatera BOM:", winId);
  // Anropa BOM-specifik uppdatering här.
}

function openAnotherBom() {
  // Lägg till den funktion som behövs för att öppna ytterligare BOM.
}
</script>

<div class="actions">
  <button onclick={refresh} title="Uppdatera BOM">🔄</button>
  <button onclick={openAnotherBom} title="Öppna BOM">➕</button>
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
