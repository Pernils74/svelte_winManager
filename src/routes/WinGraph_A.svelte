<!-- WinGraph_A.svelte -->

<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

import WinGraph_B from "./WinGraph_B.svelte";
import GraphView from "./WinGraphView.svelte";
import WinGraphDebug from "./WinGraphDebug.svelte";
import { onDestroy } from "svelte";
const wManager = getWindowManager();

let { win, winId, parentId }: WindowComponentProps = $props();

type Point3D = {
	x: number;
	y: number;
	z: number;
};

interface GraphConfig {
	pointsPerBatch: number;
	updateMs: number;
}

interface GraphDataPoints {
	points: Point3D[];
}

const config = $state<GraphConfig>({
	pointsPerBatch: 1000,
	updateMs: 100,
});

let isRunning = $state(false);

// let points: Points3D[] = [];
let points = $state<Point3D[]>([]);

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateDataPoints(numberOfPoints: number) {
	const points: Point3D[] = [];
	for (let i = 0; i < numberOfPoints; i++) {
		points.push({
			x: Math.random() * 100,
			y: Math.random() * 100,
			z: Math.random() * 100,
		});
	}
	await sleep(1);
	return points;
}

async function start() {
	if (isRunning) return;
	isRunning = true;
	while (isRunning) {
		points = await generateDataPoints(config.pointsPerBatch);
		wManager.updateProps({ points }); // will update all wins props who have points as props
		await sleep(config.updateMs);
	}
}

function stop() {
	isRunning = false;
}

function openGraph() {
	const graphWin = wManager.open(WinGraph_B, {
		winId: "MyCustomId",
		title: "📈 Plotly Graph",
		tileOffset: 40,
		width: 800,
		height: 500,
		left: 60,
		top: 10,
		payload: config,
		props: {
			points: [],
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
		payload: config,
		props: {
			points: [],
		},
	});
}
</script>
<div class="window-container">
	<h4>📡 Live Data Stream</h4>
	<p>
	Parent:	<strong>{parentId ?? "root"}</strong>
	</p>
	<label>
	Batch size
	<input
		type="number"
		min="1"
		bind:value={config.pointsPerBatch}
	/>
	Points generated: <strong>{points.length}</strong>

	</label>

	<label>
	Update interval (ms)
	<input
		type="number"
		min="1"
		bind:value={config.updateMs}
	/>
	</label>

	<div></div>

	<div class="buttons">
		<button onclick={start}>
			▶ Start
		</button>

		<button onclick={stop}>
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
			payload={config}
			points={points}
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

.buttons {
	display: flex;
	gap: 0.5rem;
}

.graph-host {
	flex: 1;
	min-height: 200px;
}
</style>
