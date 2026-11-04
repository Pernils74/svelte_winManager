<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

export interface WindowBProps {
	msg?: string;
	counter?: number;
	shared?: {};
}

let {
	win = $bindable(),
	winId,
	parentId,
}: WindowComponentProps & WindowBProps = $props();

const wManager = getWindowManager();

function updateCounter() {
	wManager.updateProps({
		counter: (win.props.counter as number ?? 0) + 1,
	}, win);
}

function updateTextFromB(value: string) {
	return;
	wManager.updateProps({
		myNoneReactiveProp: value,
	}, win);
}

function reparentToRoot() {
	const bounds = win.boundingEl?.getBoundingClientRect();
	if (!bounds) return;

	wManager.reparent(winId, "root", {
		left: bounds.left,
		top: bounds.top,
		width: bounds.width,
		height: bounds.height,
	});
}

function detachToTab() {
	wManager.detachWindow(win, "browser-tab");
}

function detachToWindow() {
	wManager.detachWindow(win, "browser-window");
}

$effect(() => {
	console.log("prop i B: ", win.props);
});
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

	<hr />

	<h4>Props Demo</h4>

	<p>
		Received prop:
		<code>{String(win.props.msg ?? "")}</code>
	</p>


	<input
		type="text"
		value={String(win.props.msg ?? "")}
		oninput={(event) =>
			updateTextFromB(event.currentTarget.value)}
		placeholder="Update prop from Window B..."
	/>


	<input
		type="text"
		bind:value={win.props.shared.msg2}
		placeholder="Type text..."
	/>


	<hr />

	<h4>Counter Demo</h4>

	<p>
		Counter:
		<strong>{Number(win.props.counter ?? 0)}</strong>
	</p>

	<button onclick={updateCounter}>
		➕ Increment Counter
	</button>
	<hr />

{#if win.props}
  {@const propText =JSON.stringify($state.snapshot(win.props), null, 2)}
    <pre>{propText}</pre>
  {:else}
    <p> inget</p>
{/if}

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
	background: white;
	padding: 1rem;
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
