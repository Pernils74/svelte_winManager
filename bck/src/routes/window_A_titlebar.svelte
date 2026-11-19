<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

let { win, winId, renderTargetWinId }: WindowComponentProps = $props();

import WindowB from "./window_B.svelte";
import WinGraphA from "./WinGraph_A.svelte";
import brodcastChannelMonitor from "./BroadcastChannelMonitor.svelte";

const wManager = getWindowManager();

function refresh() {
	console.log("Uppdatera BOM:", winId);
	// Anropa BOM-specifik uppdatering här.
}

function openWindow_B() {
	wManager.open(WindowB, {
		winId: "Window_B",
		title: "🪟 Winodw B",
		width: 700,
		height: 600,
	});
}

function openWinGraph_A() {
	wManager.open(WinGraphA, {
		title: "🪟 Winodw GraphA",
		width: 700,
		height: 600,
	});
}

function openBroadcastChannelMonitor() {
	wManager.open(brodcastChannelMonitor, {
		title: "🪟 BroadcastChannel Monitor",
		// Reparent this window to the window with ID 1 (Window A)

		width: 700,
		height: 600,
		left: 250,
		top: 800,
		props: { channelName: "svelte_winmanager_channel" },
	});
}
</script>

<div class="actions">
	<button onclick={refresh} title="Uppdatera BOM">🔄</button>
	<button onclick={openWindow_B} title="Open Window B">Open 🪟 B </button>
	<button onclick={openWinGraph_A} title="Open Graph Demo">  📊 Open Graph Demo	</button>
	<button onclick={openBroadcastChannelMonitor}
		title="Open BroadcastChannel Monitor">  📡 Open BroadcastChannel Monitor	</button>
</div>

<style>
.actions {
	display: flex;
	align-items: center;
	gap: 0.25rem;
}

button {
	cursor: pointer;
	border: 0;
	border-radius: 4px;
	padding: 4px 8px;
	background: #007acc;
	color: white;
}
</style>
