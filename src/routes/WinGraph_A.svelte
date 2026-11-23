<!-- WinGraph_A.svelte -->
<script lang="ts">
import { getWindowManager, type WindowComponentProps, type WindowInstance } from "#lib/windowManager.svelte.ts";
import { onDestroy } from "svelte";
import WinGraph_B from "./WinGraph_B.svelte";
import GraphView, { type PointCloud } from "./WinGraphView.svelte";

import WinGraphDebug from "./WinGraphDebug.svelte";

const wManager = getWindowManager();
let { renderTargetWinId }: WindowComponentProps = $props();

type WinGraphBProps = {
	pointsPerBatch: number;
	updateMs: number;
	cloud: PointCloud | null;
	onSetBatch?: (newBatch: number) => void;
};

let pointsPerBatch = $state(5000);
let updateMs = $state(50);
let isRunning = $state(false);
let cloud = $state.raw<PointCloud | null>(null);
let graphWin = $state<WindowInstance<WinGraphBProps> | null>(null);

function generatePointCloud(count: number): PointCloud {
	const x = new Float32Array(count);
	const y = new Float32Array(count);
	const z = new Float32Array(count);
	const t = performance.now() * 0.001;

	for (let i = 0; i < count; i++) {
		const angle = i * 0.05 + t;
		const radius = (i / count) * 50;
		x[i] = Math.cos(angle) * radius;
		y[i] = Math.sin(angle) * radius;
		z[i] = Math.sin(radius * 0.2 + t) * 20;
	}
	return { count, x, y, z };
}

// Callback som anropas från WinGraph_B (även när WinGraph_B är detachad!)
function setPointsPerBatch(newBatch: number) {
	const clamped = Math.max(100, Math.min(Math.round(newBatch), 100000));
	pointsPerBatch = clamped;
	if (graphWin) {
		graphWin.props.pointsPerBatch = clamped;
	}
}

async function start() {
	if (isRunning) return;
	isRunning = true;

	while (isRunning) {
		const nextCloud = generatePointCloud(pointsPerBatch);
		cloud = nextCloud;

		if (graphWin) {
			graphWin.props.cloud = nextCloud;
		}

		// Ge webbläsaren andrum mellan varje batch
		await new Promise((r) => setTimeout(r, updateMs));
	}
}

function stop() {
	isRunning = false;
}

onDestroy(stop);

function openGraph() {
	graphWin = wManager.open<WinGraphBProps>(WinGraph_B, {
		winId: "MyCustomId",
		title: "📈 Plotly 3D Stream",
		width: 800,
		height: 550,
		left: 420,
		top: 40,
		props: {
			pointsPerBatch,
			updateMs,
			cloud: null,
			onSetBatch: setPointsPerBatch,
		},
	});
}

function openDebug() {
	wManager.open(WinGraphDebug, {
		title: "🐞 Graph Debug",
		width: 400,
		height: 300,
		left: 30,
		top: 10,
		props: {
			points: [],
			pointsPerBatch: pointsPerBatch,
			updateMs: updateMs,
		},
	});
}
</script>
<div class="window-container">
	<h4>📡 Live Data Stream</h4>
	<p>Parent:	<strong>{renderTargetWinId ?? "root"}</strong></p>

	<label>
	Points per Batch
	<input
		type="number"
		min="1"
		bind:value={pointsPerBatch}
	/>
	<!-- Points generated: <strong>{points.length}</strong> -->
	</label>

	<label>
	Update interval (ms)
	<input
		type="number"
		min="1"
		bind:value={updateMs}
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
			// config={config}
			cloud={cloud}
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
