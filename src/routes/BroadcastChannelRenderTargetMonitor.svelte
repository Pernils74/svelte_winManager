<!-- BroadcastChannelMonitor.svelte -->

<script lang="ts">
import { onMount } from "svelte";

interface Props {
	winId?: string;
	renderTargetWinId?: string;
	channelName?: string;
}

let {
	winId,
	renderTargetWinId,
	channelName = "svelte_winmanager_channel",
}: Props = $props();

let connected = $state(false);
let lastMessage = $state<any>(null);

let channel: BroadcastChannel | null = null;

onMount(() => {
	channel = new BroadcastChannel(channelName);

	channel.onmessage = (event) => {
		const packet = event.data;

		if (winId && packet?.to_WinId !== winId) {
			return;
		}

		if (
			renderTargetWinId &&
			packet?.message?.renderTargetWinId !== renderTargetWinId
		) {
			return;
		}

		lastMessage = {
			timestamp: new Date().toLocaleTimeString(),
			packet,
		};
	};

	connected = true;

	return () => {
		channel?.close();
		connected = false;
	};
});

function clear() {
	lastMessage = null;
}
</script>

<div class="monitor">
	<div class="header">
		<h3>BroadcastChannel Monitor</h3>

		<div class="status">
			{#if connected}
				🟢 Connected
			{:else}
				🔴 Disconnected
			{/if}
		</div>
	</div>

	<div class="info">
		<div>
			<b>Channel:</b> {channelName}
		</div>

		{#if winId}
			<div>
				<b>WinId:</b> {winId}
			</div>
		{/if}

		{#if renderTargetWinId}
			<div>
				<b>RenderTargetWinId:</b> {renderTargetWinId}
			</div>
		{/if}
	</div>

	<div class="toolbar">
		<button onclick={clear}>
			Clear
		</button>
	</div>

	<div class="content">
		{#if lastMessage}
			<div class="time">
				{lastMessage.timestamp}
			</div>

			<pre>{JSON.stringify(lastMessage.packet, null, 2)}</pre>
		{:else}
			<div class="empty">
				No matching message received
			</div>
		{/if}
	</div>
</div>

<style>
.monitor {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: #1e1e1e;
	color: white;
	font-family: monospace;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.5rem;
	background: #333;
}

.info {
	padding: 0.5rem;
	border-bottom: 1px solid #444;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.toolbar {
	padding: 0.5rem;
	border-bottom: 1px solid #444;
}

.content {
	flex: 1;
	overflow: auto;
	padding: 0.5rem;
}

.time {
	color: #7dd3fc;
	margin-bottom: 0.5rem;
}

pre {
	margin: 0;
	white-space: pre-wrap;
	word-break: break-word;
}

.empty {
	color: #999;
}
</style>
``
