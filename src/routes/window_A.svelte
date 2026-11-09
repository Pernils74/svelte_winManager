<!-- window_A.svelte -->
<script lang="ts">
import { onMount } from "svelte";
import { getWindowManager, type WindowInstance } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

import WindowRegistryDebug from "#lib/WindowRegistryDebug.svelte";

import Window_B from "./window_B.svelte";
import { type WindowBProps } from "./window_B.svelte";

import Wallpaper from "#lib/Wallpaper.svelte";

let { win, winId, renderTargetWinId }: WindowComponentProps = $props();

const wManager = getWindowManager();

// let message = $statederived(win.props.msg);
let message = $state("Hello from A");

let win_B = $state<WindowInstance | null>(null);

const shared = $state({
	msg2: "Hello from A shared.msg2",
	counter: 0,
});

function spawnReactive() {
	// Om wManager.open stöder generiska typer (kika i ditt fönster-bibliotek)
	win_B = wManager.open(Window_B, {
		title: "🔗 Window_B (Props)",
		width: 600,
		height: 950,
		top: 100,
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
	// console.log("prop: ", message);

	// console.log(
	// 	[...wManager.windows].map((w) => ({
	// 		id: w.winId,
	// 		parent: w.renderTargetWinId,
	// 	})),
	// );

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
		WinId: <strong> {winId}     </strong><br>
		RenderTargetWinId: <strong>{renderTargetWinId ?? "root"}     </strong><br>
		wManagerId: <strong>{win.wManagerId ?? "root"}</strong><br>
		Antal wins: <strong> {wManager.winCount}     </strong>
	</p>
	<WindowRegistryDebug {wManager} />
	<hr/>
	envägs	
	<input
		type="text"
		bind:value={message}
		placeholder="Type text..."
	/>
	2 vägs
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
