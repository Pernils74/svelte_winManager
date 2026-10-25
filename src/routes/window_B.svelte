<!-- window_B.svelte -->
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
import Window_C from "./window_C.svelte"; // Se till att du har ett fönster C importerat

// 1. Export the component-specific prop definitions.
export interface WindowBProps {
  myNoneReactiveProp: string; // Becomes locked to what it was at the exact moment of creation
}

// 2. Intersect the core window infrastructure props with your custom properties
let { win, winId, parentId, myNoneReactiveProp }:
  & WindowComponentProps
  & WindowBProps = $props();

const wManager = getWindowManager();

// 3. Local reactive state to be passed down as payload to Window C
let myData = $state({
  counter: 0,
});

function openWindow_C() {
  wManager.open(Window_C, {
    // parentId: winId,
    title: "🪟 Window_C",
    width: 400,
    height: 500,
    // Pass the current state inside the manager's payload context instead of props
    payload: myData,
    // payload: {
    //   get bCounter() {
    //     return counter;
    //   },
    // },
  });
}

function reparentToRoot() {
  wManager.reparent(win.winId, "root");
}
</script>

<div class="window-container">
  <header class="meta-info">
    <p>Parent Context: <strong>{parentId ?? 'root'}</strong></p>
    <p>Window ID: <small>{winId}</small></p>
  </header>

  <!-- Static Snapshot Demo -->
  <div class="demo-box">
    <span class="box-label">Static Snapshot Received:</span>
    <p class="snapshot-value">"{myNoneReactiveProp}"</p>
    <p class="explanation">
      ℹ️ <strong>Non-Reactive Notice:</strong> Fails to update if Window A input changes.
    </p>
  </div>

  <!-- Reactive Payload Spawning Demo -->
  <div class="demo-box payload-box">
    <span class="box-label">Payload Preparation (Window B State)</span>
    <p
      class="explanation">Current counter value: <strong>{myData.counter}</strong></p>

    <div class="button-group">
      <button onclick={() => myData.counter++} class="btn-increment">
        ➕ Increment Counter
      </button>
      <button onclick={openWindow_C} class="btn-main">
        🚀 Spawn Window C with Payload
      </button>
    </div>
  </div>

  <footer class="footer-actions">
    <button onclick={reparentToRoot} class="btn-sub"
      disabled={parentId === 'root'}>
      🖥️ Detach to desktop root
    </button>
  </footer>
</div>

<style>
.window-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  font-family: system-ui, sans-serif;
  color: #1e293b;
}

.meta-info p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  color: #475569;
}

.demo-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.payload-box {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.box-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #64748b;
  letter-spacing: 0.05em;
}

.snapshot-value {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #0f172a;
  font-family: monospace;
  background: #e2e8f0;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.explanation {
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.footer-actions {
  margin-top: auto;
}

button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}

.btn-main {
  background: #16a34a;
  color: white;
}
.btn-main:hover {
  background: #15803d;
}

.btn-increment {
  background: white;
  color: #1e293b;
  border-color: #bbf7d0;
}
.btn-increment:hover {
  background: #f0fdf4;
}

.btn-sub {
  background: white;
  color: #334155;
  border-color: #cbd5e1;
}
.btn-sub:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}
.btn-sub:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  border-color: #e2e8f0;
  cursor: not-allowed;
}
</style>
