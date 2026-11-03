<!-- BroadcastChannelMonitor.svelte -->

<script lang="ts">
import { onMount } from "svelte";

interface Props {
	channelName?: string;
}

let { win, winId, channelName = "window-manager" }: Props = $props();

type LogEntry = {
	timestamp: string;
	message: unknown;
};

let messages = $state<LogEntry[]>([]);
let connected = $state(false);

let channel: BroadcastChannel | null = null;
// let channel = new BroadcastChannel("window-sync-${winId}");

function addMessage(message: unknown) {
	messages.unshift({
		timestamp: new Date().toLocaleTimeString(),
		message,
	});

	if (messages.length > 100) {
		messages.length = 100;
	}
}

onMount(() => {
	channel = new BroadcastChannel(channelName);

	channel.onmessage = (event) => {
		console.log(
			"[BroadcastChannel]",
			channelName,
			event.data,
		);

		addMessage(event.data);
	};

	connected = true;

	return () => {
		channel?.close();
		connected = false;
	};
});

function clear() {
	messages = [];
}

function testMessage() {
	channel?.postMessage({
		type: "test",
		from: crypto.randomUUID(),
		time: Date.now(),
	});
}
</script>

<div class="monitor">
	<div class="header">
		<h3>BroadcastChannel</h3>

		<div class="status">
			{#if connected}
				🟢 Connected
			{:else}
				🔴 Disconnected
			{/if}
		</div>
	</div>

	<div class="channel">
		Channel:
		<b>{channelName}</b>
	</div>

	<div class="toolbar">
		<button onclick={testMessage}>
			Send Test
		</button>

		<button onclick={clear}>
			Clear
		</button>
	</div>

	<div class="messages">
		{#each messages as msg}
			<div class="message">
				<div class="time">
					{msg.timestamp}
				</div>

				<pre>
{JSON.stringify(msg.message, null, 2)}
				</pre>
			</div>
		{/each}

		{#if messages.length === 0}
			<div class="empty">
				No messages received
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

.channel {
	padding: 0.5rem;
	border-bottom: 1px solid #444;
}

.toolbar {
	display: flex;
	gap: 0.5rem;
	padding: 0.5rem;
	border-bottom: 1px solid #444;
}

.messages {
	flex: 1;
	overflow: auto;
	padding: 0.5rem;
}

.message {
	padding: 0.5rem;
	margin-bottom: 0.5rem;
	background: #2a2a2a;
	border-radius: 4px;
}

.time {
	color: #7dd3fc;
	margin-bottom: 0.25rem;
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
