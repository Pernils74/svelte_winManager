<script lang="ts">
// src/lib/ArenaMonitorButtons.svelte
import { getWindowManager } from "./windowManager.svelte.ts"; // Lagt till .ts för Deno/SvelteKit3

let { winId = "" } = $props();

const wManager = getWindowManager();

// ✅ Hittar fönstret reaktivt baserat på winId
let win = $derived(wManager.find(winId));

// ✅ Faller tillbaka på de globala manager-inställningarna om win saknas
let useArena = $derived(win ? win.useArena : wManager.useArena);
let useMonitor = $derived(win ? win.useMonitor : wManager.useMonitor);
</script>

<button
  type="button"
  class:active={useArena}
  onclick={(e) => {
    e.stopPropagation();
    // ✅ Ändrat från $state(!useArena) till en helt vanlig JavaScript-invertering
    const newArena = !useArena; 
    
    if (win) {
      win.useArena = newArena;
    } else {
      wManager.useArena = newArena;
      wManager.updateAll({ useArena: newArena });
    }
  }}
>
  Arena
</button>

<button
  type="button"
  class:active={useMonitor}
  class:invisible={!useMonitor}
  onclick={(e) => {
    e.stopPropagation();
    const newMonitor = !useMonitor;
    
    if (win) {
      win.useMonitor = newMonitor;
    } else {
      wManager.useMonitor = newMonitor;
      wManager.updateAll({ useMonitor: newMonitor });
    }
  }}
>
  Monitor
</button>

<style>
/* Allmän knappstil */
button {
  background-color: #f0f0f0;
  border: 2px solid #ccc;
  border-radius: 0.3rem;
  padding: 0.3rem 1rem;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 2px 3px 5px rgba(0, 0, 0, 0.3);
  transition:
    transform 0.1s ease,
    box-shadow 0.1s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

button:hover {
  background-color: #e0e0ff;
  border-color: #888;
}

button:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.5);
}

button.invisible {
  opacity: 0; /* 🔥 gör knappen osynlig */
  pointer-events: auto; /* 🔥 tillåter klick */
}

/* Aktiv tab-knapp */
button.active {
  background-color: #4a90e2;
  color: rgb(82, 237, 105);
  border-color: #2c6ac7;
  transform: scale(0.96);
  box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.3);
}
</style>
