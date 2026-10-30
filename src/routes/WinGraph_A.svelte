<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

import WinGraph_B from "./WinGraph_B.svelte";
import GraphView from "./WinGraphView.svelte";
import WinGraphDebug from "./WinGraphDebug.svelte";
import { onDestroy } from "svelte";

let { parentId }: WindowComponentProps = $props();

const wManager = getWindowManager();

type Point3D = {
	x: number;
	y: number;
	z: number;
};

const payload = $state({
	points: [] as Point3D[],
});

let isRunning = $state(false);

let pointsPerBatch = $state(1000);
let updateMs = $state(100);

let pointsPerSecond = $state(0);
let addedSinceLast = 0;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pumpLoop() {
	while (isRunning) {
		const batch: Point3D[] = [];

		for (let i = 0; i < pointsPerBatch; i++) {
			batch.push({
				x: Math.random() * 100,
				y: Math.random() * 100,
				z: Math.random() * 100,
			});
		}

		payload.points = batch;
		await sleep(updateMs);
	}
}

function startPump() {
	if (isRunning) return;
	isRunning = true;
	void pumpLoop();
}

function stopPump() {
	isRunning = false;
}

function openGraph() {
	const graphWin = wManager.open(WinGraph_B, {
		title: "📈 Plotly Graph",
		width: 800,
		height: 500,
		left: 60,
		top: 10,
		payload,
		props: {
			pointsPerBatch,
			updateMs,
		},
	});
	// wManager.detachWindow(
	// 	graphWin,
	// 	"window",
	// );
}

function openDebug() {
	wManager.open(WinGraphDebug, {
		title: "🐞 Graph Debug",
		width: 400,
		height: 300,
		left: 30,
		top: 10,

		payload,
		props: {
			pointsPerBatch,
			updateMs,
		},
	});
}

const throughputTimer = window.setInterval(() => {
	pointsPerSecond = addedSinceLast;
	addedSinceLast = 0;
}, 1000);

onDestroy(() => {
	stopPump();
	clearInterval(throughputTimer);
});
</script>

<div class="window-container">
	<h3>Graph Producer</h3>

	<p>
		Parent:
		<strong>{parentId ?? "root"}</strong>
	</p>

	<label>
	Batch size
	<input
		type="number"
		min="1"
		bind:value={pointsPerBatch}
	/>
	</label>

	<label>
	Update interval (ms)
	<input
		type="number"
		min="1"
		bind:value={updateMs}
	/>
	</label>

	<div>
	Points:
	<strong>{payload.points.length}</strong>
	</div>

	<div>
	Points/s:
	<strong>{pointsPerSecond}</strong>
	</div>

	<div>
	Theoretical:
	<strong>
		{Math.round(pointsPerBatch * 1000 / updateMs)}
	</strong>
	</div>

	<div class="buttons">
		<button onclick={startPump}>
			▶ Start
		</button>

		<button onclick={stopPump}>
			⏹ Stop
		</button>

		<button onclick={openGraph}>
			📈 Open Graph Window
		</button>

		<button onclick={openDebug}>
			🐞 Open Debug Window
		</button>
	</div>

	<div class="graph-host">
		<GraphView
			{payload}
			pointsPerBatch={pointsPerBatch}
			updateMs={updateMs}
		/>
	</div>
</div>

<style>
.window-container {
	display: flex;
	flex-direction: column;
	gap: 1rem;

	width: 100%;
	height: 100%;

	padding: 1rem;
	background: antiquewhite;
}

.settings {
	display: flex;
	gap: 1rem;
}

.settings label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.stats {
	display: flex;
	gap: 1rem;
	font-family: monospace;
}

.buttons {
	display: flex;
	gap: 0.5rem;
}

.graph-host {
	flex: 1;
	min-height: 200px;
}
</style>
