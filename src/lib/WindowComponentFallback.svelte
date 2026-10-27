<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import { getAllRegisteredKeys } from "#lib/windowRegistry.ts";

let {
  componentKey = "Unknown",
}: {
  componentKey?: string;
} = $props();

const allComponents = $derived(getAllRegisteredKeys());
</script>

<div class="fallback">
  <h3>⚠️ Window component missing</h3>

  <p>
      Could not load component:
      <strong>{componentKey}</strong>
    </p>

  <p class="help">
      If this is a detached browser tab or Tauri window,
      make sure the component is registered in the new JavaScript context.
    </p>
  <div class="registry-section">
    <h3>Registered Framework Components:</h3>
    <div class="badge-list">
          {#each allComponents as [key, component]}
            <span class="component-badge">📦 {key}</span>
          {/each}
        </div>
  </div>
</div>

<style>
.fallback {
  margin: 15px;
  padding: 20px;
  border: 2px dashed #ff4d4d;
  border-radius: 8px;
  background: #fff0f0;
  color: #cc0000;
  font-family: sans-serif;
}

.help {
  color: #555;
  font-size: 0.9em;
}

.badge-list {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.component-badge {
  background: #edf2f7;
  color: #2d3748;
  padding: 0.25rem 0.65rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-family: monospace;
  font-weight: 600;
}
</style>
