<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

export interface WindowBProps {
	myNoneReactiveProp?: string;
}

let {
	win,
	winId,
	parentId,
	myNoneReactiveProp,
}: WindowComponentProps & WindowBProps = $props();

const wManager = getWindowManager();

let localText = $state("");

$effect(() => {
	localText = (win.props.myNoneReactiveProp as string) ?? "";
});

function reparentToRoot() {
	wManager.reparent(winId, "root");
}

function detachToTab() {
	wManager.detachWindow(win, "tab");
}

function detachToWindow() {
	wManager.detachWindow(win, "window");
}
</script>

<div class="window-container">
  <h3>{win.title}</h3>

  <p>
    Parent: <strong>{parentId ?? "root"}</strong>
  </p>
  <p>
    WinId:
    <small>{winId}</small>
  </p>
  <!-- <hr /> -->

  <!-- <h4>Props Demo</h4> -->

  <p>
    Original prop:
    <code>{myNoneReactiveProp}</code>
  </p>


  {#if win.payload}
    <h4>Payload Demo</h4>
    {@const payloadText =JSON.stringify($state.snapshot(win.payload), null, 2)}
    <pre>{payloadText}</pre>
    <p>
    <input
      type="text"
      bind:value={win.payload.text}
      placeholder="Type text..."
    />
    </p>
      <button onclick={() => win.payload.counter++}  >
        ➕ Increment Payload Counter ({win.payload.counter})
    </button>
    <hr>
  {:else}
    <p>
      Updated via updateProps:
      <code>{localText}</code>
    </p>
  {/if}




  <hr />

  <div class="actions">
    <button
      onclick={reparentToRoot}
      disabled={parentId === "root"}
    >
      🖥️ Reparent To Root
    </button>

    <button onclick={detachToTab}>
      📑 Detach To Tab
    </button>

    <button onclick={detachToWindow}>
      🪟 Detach To Window
    </button>
  </div>
</div>

<style>
.window-container {
	display: flex;
	flex-direction: column;
	/* gap: 0.25rem; */
	background: white;
	padding: 1.0rem;
	background-color: rgb(243, 245, 247);
	width: 100%;
	height: 100%;
}

.actions {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

code,
pre {
	background: #f1f5f9;
	padding: 0.4rem;
	border-radius: 4px;
}

button {
	padding: 0.5rem;
}
</style>
