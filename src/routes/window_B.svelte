<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

import WindowRegistryDebug from "#lib/WindowRegistryDebug.svelte";

export interface WindowBProps {
	msg?: string;
	counter?: number;
	shared?: Record<string, unknown> & { msg2?: string };
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
	wManager.updateProps({
		msg: value,
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

// $effect(() => {
// 	console.log("prop i B: ", win.props);
// });
</script>

<div class="window-container">
	<h3>{win.title}</h3>

	<WindowRegistryDebug {wManager} />

	<p>
		Parent: <strong>{parentId ?? "root"} antal wins {wManager.winCount}</strong>
	</p>
	<p>
		wManagerId: <strong>{win.wManagerId ?? "root"}</strong>
	</p>
	<p>
		Parent wManagerId: <strong>{wManager.find(win.parentId )?.wManagerId?? "root"}</strong><br>
		Parent wManagerId: <strong>{wManager.find(parentId )?.wManagerId?? "root"}</strong>
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

	envägs 
	<input
		type="text"
		value={String(win.props.msg ?? "")}
		oninput={(event) =>
			updateTextFromB(event.currentTarget.value)}
		placeholder="Update prop from Window B..."
	/>

    2 vägs
	<input
		type="text"
		value={((win.props as WindowBProps).shared?.msg2 ?? "")}
		oninput={(event) => {
			const props = win.props as WindowBProps;
			const shared = props.shared ?? {} as Record<string, unknown> & { msg2?: string };
			shared.msg2 = event.currentTarget.value;
			props.shared = shared;
			win.props = props as typeof win.props;
		}}
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

	<!-- <div class="actions">
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
	</div> -->
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
