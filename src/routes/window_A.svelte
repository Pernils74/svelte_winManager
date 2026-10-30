<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

import Window_B from "./window_B.svelte";
import Wallpaper from "#lib/Wallpaper.svelte";
import WindowATitlebar from "./window_A_titlebar.svelte";

let { winId, parentId }: WindowComponentProps = $props();

const wManager = getWindowManager();

let message = $state("Hello from A");

// används för updateProps-demo

function spawnStatic() {
	wManager.open(Window_B, {
		// parentId: winId,
		title: "📸 Window_B (Static)",
		width: 550,
		height: 600,
		top: 300,
		left: 650,
		titlebar: WindowATitlebar,
		props: {
			myNoneReactiveProp: message,
		},
	});
}

function spawnReactive() {
	const child = wManager.open(Window_B, {
		// parentId: winId,
		title: "🔗 Window_B (Reactive Props)",
		width: 550,
		height: 600,
		top: 300,
		left: 650,
		props: {
			myNoneReactiveProp: message,
		},
	});
}

// Demo example for the recative payload
const myPayload = $state({
	text: "",
	counter: 0,
});

function spawnPayload() {
	wManager.open(Window_B, {
		// parentId: winId,
		title: "📦 Window_B (Payload)",
		width: 550,
		height: 800,
		top: 100,
		left: 650,
		payload: myPayload,
	});
}

$effect(() => {
	myPayload.text = message;
	wManager.updateProps({
		myNoneReactiveProp: message,
	});
});
</script>

<Wallpaper word="Window A" />

<div class="window-container">
	<h3>Window A</h3>
	<p>Parent: <strong>{parentId ?? "root"}</strong></p>

	<input
		type="text"
		bind:value={message}
		placeholder="Type text..."
	/>

	<p>
    Current prop value:
    <strong><code>{message}</code></strong>
  </p>
	<p>
    Current myPayload.text value:
    <strong><code>{myPayload.text}</code></strong>
  </p>
	<button onclick={() => myPayload.counter++}>
  ➕ Increment Shared Payload .. {myPayload.counter}
  </button>

	<hr>
	<div class="buttons">
		<button onclick={spawnStatic}>
      📸 Spawn Static
    </button>

		<button onclick={spawnReactive}>
      🔗 Spawn Reactive Props
    </button>

		<button onclick={spawnPayload}>
      📦 Spawn Payload
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
	background-color: antiquewhite;
	width: 100%;
	height: 100%;
}

code {
	background: #f1f5f9;
	padding: 0.4rem;
	border-radius: 4px;
}

button {
	padding: 0.5rem;
}
</style>
