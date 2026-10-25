<!--

https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/WindowFrame.svelte
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/WindowHost.svelte
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/windowManager.svelte.ts

https://github.com/Pernils74/svelte_winManager/blob/main/src/routes/window_A.svelte
https://github.com/Pernils74/svelte_winManager/blob/main/src/routes/window_B.svelte
https://github.com/Pernils74/svelte_winManager/blob/main/src/routes/window_C.svelte

https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/windowRegistry.ts
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/windowBackend.ts



https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/Wallpaper.svelte
-->

<!-- gammalt ...
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/tauriWindowBackend.ts
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/browserTabBackend.ts -->

<!-- +page.svelte -->
<script lang="ts">
import { onMount } from "svelte";
import Wallpaper from "#lib/Wallpaper.svelte";

import WindowHost from "#lib/WindowHost.svelte";

import { initializeWindowManager } from "#lib/windowManager.svelte.ts";
import { getAllComponentsAsArray } from "#lib/windowRegistry.ts";

import WindowA from "./window_A.svelte";
import WindowB from "./window_B.svelte";
import WindowC from "./window_C.svelte";

import WindowATitlebar from "./window_A_titlebar.svelte";

const wManager = initializeWindowManager();

onMount(() => {
  wManager.open(WindowA, {
    title: "🪟 Winodw A",
    width: 600,
    height: 600,
    left: 10,
    top: 300,
    titlebar: WindowATitlebar, // Inject a custom component into the titlebar space, or leave undefined for default controls
  });

  wManager.open(WindowB, {
    title: "🪟 Winodw B",
    width: 500,
    height: 600,
    left: 650,
    top: 300,
  });
  // wManager.open(WindowC, {
  //   title: "🪟 Winodw C",
  //   width: 700,
  //   height: 600,
  //   left: 850,
  //   top: 800,
  // });
});

const allComponents = $derived(getAllComponentsAsArray());
$effect(() => {
  console.log(allComponents);
});
</script>

WindowHost.topbarContent ="hjhkhkjh"
<WindowHost>
  {#snippet children()}
    <div class="welcome-container">
      <h1>Welcome to Svelte Window Manager</h1>
      <p>Visit <a href="https://github.com/Pernils74/svelte_winManager">Pernils74/svelte_winManager</a> to read the official documentation.</p>
      
      <!-- 🌟 NY SEKTION: Häftiga fönsterfunktioner / Genvägar -->
      <section class="features-grid">
        <div class="feature-card">
          <h4>🎛️ Context & Hierarchy</h4>
          <ul>
            <li><strong>Reparenting:</strong> Hold <kbd>Shift</kbd> while dragging a titlebar to drop and embed a window inside another window context.</li>
            <li><strong>Desktop Detach:</strong> Fönsterkomponenter kan enkelt flyttas ut till skrivbordsroten igen genom att kalla på hanterarens reparent-metod.</li>
          </ul>
        </div>

        <div class="feature-card">
          <h4>🧬 Cloning & Window State</h4>
          <ul>
            <li><strong>Instant Duplicate:</strong> Hold <kbd>Ctrl</kbd> while dragging a titlebar to create a standalone, decoupled copy of that window with an offset.</li>
            <li><strong>Intelligent Maximize:</strong> Double-click the titlebar to maximize. It automatically respects and tiles around existing adjacent docked borders.</li>
          </ul>
        </div>

        <div class="feature-card">
          <h4>📐 Proportional Docking & Snapping</h4>
          <ul>
            <li><strong>Magnetic Snapping:</strong> Windows automatically snap edge-to-edge when dragged within a 12px threshold of workspace boundaries or sibling frames.</li>
            <li><strong>Proportional Resize:</strong> Dragging shared borders expands or shrinks adjacent docked windows fluidly while locked to system constraints.</li>
          </ul>
        </div>
      </section>

      <div class="registry-section">
        <h3>Registered Framework Components:</h3>
        <div class="badge-list">
          {#each allComponents as [key, component]}
            <span class="component-badge">📦 {key}</span>
          {/each}
        </div>
      </div>
    </div>

    <Wallpaper word="+page.svelte"></Wallpaper>
  {/snippet}
</WindowHost>

<style>
.welcome-container {
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1.5rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1e293b;
  position: relative;
  z-index: 1; /* Ligger ovanpå Wallpaper */
}

h1 {
  font-size: 2.25rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 0.5rem;
}

a {
  color: #2563eb;
  text-decoration: none;
  font-weight: 500;
}
a:hover {
  text-decoration: underline;
}

/* Grid för alla coola Window-features */
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.25rem;
  margin: 2.5rem 0;
}

.feature-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1.25rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.feature-card h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #334155;
  border-bottom: 2px solid #f1f5f9;
  padding-bottom: 0.5rem;
}

.feature-card ul {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 0.85rem;
  line-height: 1.4;
  color: #475569;
}

kbd {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
  font-size: 0.75rem;
  box-shadow: 0 1px 0 rgba(0,0,0,0.1);
  font-family: inherit;
}

/* Registry list städad till snygga badges istället för rå <ul> */
.registry-section {
  background: rgba(248, 250, 252, 0.6);
  border-radius: 8px;
  padding: 1rem;
  border: 1px dashed #cbd5e1;
}

.registry-section h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  font-weight: 600;
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
