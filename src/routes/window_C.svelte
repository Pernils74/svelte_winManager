<!-- window_C.svelte -->
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

// 1. Define the structural interface for the incoming payload from Window B
interface WindowCPayload {
  counter: number;
}

// 2. Bind the payload interface to the WindowComponentProps generic
let { win, winId, parentId }: WindowComponentProps<WindowCPayload> = $props();
</script>

<div class="window-container">
  <header class="meta-info">
    <p>Parent Context: <strong>{parentId ?? 'root'}</strong></p>
    <p>Window ID: <small>{winId}</small></p>
  </header>

  <div class="demo-box payload-box">
    <span class="box-label">Reactive Payload Received:</span>

    <!-- 3. Read the payload data safely and reactively via the win instance -->
    <div class="counter-display">
      <span class="label">bCounter Value:</span>
      <span class="badge">{win.payload?.counter ?? 0}</span>
    </div>

    <p class="explanation">
      ⚙️ <strong>MDI State Note:</strong> This value is fetched directly from the window instance payload registry.
    </p>
  </div>

  <div class="button-group">
    <button onclick={() => win.payload.counter++} class="btn-increment">
      ➕ Increment Counter
    </button>
  </div>
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
  color: #16a34a;
  letter-spacing: 0.05em;
}

.counter-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border: 1px solid #bbf7d0;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  margin-top: 0.25rem;
}

.counter-display .label {
  font-size: 0.9rem;
  font-weight: 500;
}

.counter-display .badge {
  background: #dc2626;
  color: white;
  font-family: monospace;
  font-weight: 700;
  font-size: 1rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.explanation {
  font-size: 0.8rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0.25rem 0 0 0;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
