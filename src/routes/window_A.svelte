<!-- WindowA.svelte -->
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
import Window_B, { type WindowBProps } from "./window_B.svelte";
import Wallpaper from "#lib/Wallpaper.svelte";

let { winId, parentId }: WindowComponentProps = $props();
const wManager = getWindowManager();

// Reactive state holding the live input text string
let message = $state("Hello from A");

function openWindow_B() {
  wManager.open(Window_B, {
    parentId: winId,
    title: "🪟 Window_B",
    width: 400,
    height: 300,
    // Passes the current input string value as a static, non-reactive property snapshot
    props: {
      myNoneReactiveProp: message,
    } satisfies WindowBProps,
  });
}

import WindowATitlebar from "./window_A_titlebar.svelte";
$effect(() => {
  // win.titlebar = WindowATitlebar;
  // Possible, but less efficient as it triggers an extra reactive update cycle after mounting.
  // Prefer passing the titlebar component directly inside the wManager.open() options.
});
</script>

<Wallpaper word="Window A"></Wallpaper>

<div class="window-container">
  <header class="meta-info">
    <p>Parent Context: <strong>{parentId ?? 'root'}</strong></p>
    <p>Window ID: <small>{winId}</small></p>
  </header>

  <div class="demo-box">
    <label for="msg-input">Type a message to send:</label>
    <input id="msg-input" type="text" bind:value={message} />

    <p class="preview-text">
      Live text in A: <code>"{message}"</code>
    </p>

    <button onclick={openWindow_B} class="btn-main">
      🚀 Spawn Window B with Snapshot
    </button>
  </div>

  <footer class="footer-actions">
    <p class="tip">
      💡 Reparenting can also be done by holding <kbd>Shift</kbd> while dragging the window titlebar to drop it onto another window.
    </p>
  </footer>
</div>

<style>
.window-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  font-family: system-ui, sans-serif;
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

label {
  font-size: 0.85rem;
  font-weight: 500;
}

input[type="text"] {
  padding: 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  outline: none;
}

input[type="text"]:focus {
  border-color: #2563eb;
}

.preview-text {
  font-size: 0.8rem;
  color: #64748b;
  margin: 0 0 0.5rem 0;
}

code {
  background: #e2e8f0;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  font-family: monospace;
}

.footer-actions {
  margin-top: auto;
}

.tip {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

kbd {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  padding: 0.1rem 0.25rem;
}

button {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.1s;
}

.btn-main {
  background: #2563eb;
  color: white;
}

.btn-main:hover {
  background: #1d4ed8;
}
</style>
