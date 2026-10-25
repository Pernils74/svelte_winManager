<!-- window_B.svelte -->
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

// 1. Export the component-specific prop definitions.
// Note: These values are static snapshots from the open() call and are NOT reactive.
export interface WindowBProps {
  myNoneReactiveProp: string; // Becomes locked to what it was at the exact moment of creation
}

// 2. Intersect the core window infrastructure props with your custom properties
let { win, winId, parentId, myNoneReactiveProp }:
  & WindowComponentProps
  & WindowBProps = $props();

const wManager = getWindowManager();

function reparentToRoot() {
  wManager.reparent(win.winId, "root");
}
</script>

<div class="window-container">
  <header class="meta-info">
    <p>Parent Context: <strong>{parentId ?? 'root'}</strong></p>
    <p>Window ID: <small>{winId}</small></p>
  </header>

  <div class="demo-box">
    <span class="box-label">Static Snapshot Received:</span>
    <p class="snapshot-value">"{myNoneReactiveProp}"</p>

    <p class="explanation">
      ℹ️ <strong>Non-Reactive Notice:</strong> If you modify the text input back inside Window A now, 
      this value will <em>not</em> change. It remains fixed to the initial snapshot.
    </p>
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
  margin: 0.5rem 0 0 0;
}

.footer-actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
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

em {
  color: #dc2626;
  font-style: normal;
  font-weight: 600;
}
</style>
