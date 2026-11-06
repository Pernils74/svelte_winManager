<!-- window_A.svelte -->
<script lang="ts">
import { onMount } from "svelte";
import { getWindowManager, type WindowInstance } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

import Window_B from "./window_B.svelte";
import { type WindowBProps } from "./window_B.svelte";

import Wallpaper from "#lib/Wallpaper.svelte";

let { win, winId, parentId }: WindowComponentProps = $props();

const wManager = getWindowManager();

// let message = $statederived(win.props.msg);
let message = $state("Hello from A");

let win_B = $state<WindowInstance | null>(null);

const shared = $state({
	msg2: "Hello from A",
	counter: 0,
});

function spawnReactive() {
	// Om wManager.open stöder generiska typer (kika i ditt fönster-bibliotek)
	win_B = wManager.open(Window_B, {
		title: "🔗 Window_B (Props)",
		width: 600,
		height: 850,
		top: 300,
		left: 650,
		props: { // <--- Ta bort <WindowBProps> härifrån
			msg: message,
			counter: 0,
			shared,
		},
	});
}
onMount(() => {
	spawnReactive();
});

// Uppdatera props i det öppnade fönstret
$effect(() => {
	console.log("prop: ", message);
	if (!win_B) return;

	wManager.updateProps({
		msg: message,
	}, win_B);
});
</script>

<Wallpaper word="Window A" />

<div class="window-container">
	<h3>Window A</h3>

	<p>
		Parent: <strong>{parentId ?? "root"}</strong>
	</p>

	<input
		type="text"
		bind:value={message}
		placeholder="Type text..."
	/>
	<input
		type="text"
		bind:value={shared.msg2}
		placeholder="Type text..."
	/>

	<p>
		Current prop value:
		<strong><code>{message}</code></strong>
	</p>
	<p>
		Current prop value (win.props.msg):
		<strong><code>{win.props.msg}</code></strong>
	</p>

	<hr />

	<div class="buttons">
		<button onclick={spawnReactive}>
			🔗 Spawn Reactive Props
		</button>
	</div>
</div>

<style>
.window-container {
	display: flex;
	flex-direction: column;
	background: white;
	padding: 1rem;
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
