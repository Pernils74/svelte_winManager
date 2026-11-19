<script lang="ts">
import { onMount } from "svelte";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

type Point3D = {
	x: number;
	y: number;
	z: number;
};

type GraphConfig = {
	pointsPerBatch: number;
	updateMs: number;
};

interface Props extends Partial<WindowComponentProps> {
	payload?: GraphConfig;
	points?: Point3D[];
	onRenderMs?: (ms: number) => void;
}

let {
	win,
	payload,
	points,
	onRenderMs,
}: Props = $props();

let fps = $state(0);
let renderMs = $state(0);
let plotlyReady = $state(false);

let plotEl: HTMLDivElement;

let pointsPerBatch = $derived(points?.length ?? 0);

let resizeObserver: ResizeObserver | undefined;

// --------------------------------------------------
// Render state
// --------------------------------------------------

let renderBusy = false;
let dirty = false;

let latestPoints: Point3D[] = [];

let frameQueued = false;
let disposed = false;

// --------------------------------------------------
// FPS
// --------------------------------------------------

let frameCount = 0;
let lastFpsTime = 0;

function updateFps() {
	frameCount++;

	const now = performance.now();

	if (now - lastFpsTime >= 1000) {
		fps = frameCount;
		frameCount = 0;
		lastFpsTime = now;
	}
}

// --------------------------------------------------
// Plotly loader
// --------------------------------------------------

let plotlyLoadPromise: Promise<void> | undefined;

function loadPlotly(): Promise<void> {
	if ((window as any).Plotly) {
		return Promise.resolve();
	}

	if (plotlyLoadPromise) {
		return plotlyLoadPromise;
	}

	plotlyLoadPromise = new Promise<void>((resolve, reject) => {
		const script = document.createElement("script");

		script.src = "https://cdn.plot.ly/plotly-3.1.0.min.js";
		script.async = true;

		script.onload = () => resolve();

		script.onerror = () => {
			plotlyLoadPromise = undefined;
			reject(new Error("Could not load Plotly"));
		};
		document.head.appendChild(script);
	});
	return plotlyLoadPromise;
}

// --------------------------------------------------
// Actual render
// --------------------------------------------------

async function render(snapshot: Point3D[]) {
	const t0 = performance.now();

	const Plotly = (window as any).Plotly;
	const x = snapshot.map((p) => p.x);
	const y = snapshot.map((p) => p.y);
	const z = snapshot.map((p) => p.z);

	await Plotly.react(
		plotEl,
		[
			{
				type: "scatter3d",
				mode: "markers",
				x,
				y,
				z,
				marker: {
					size: 2,
				},
			},
		],
	);

	if (disposed) return;
	const elapsed = performance.now() - t0;
	renderMs = elapsed;
	updateFps();
	// Rapportera verklig Plotly-tid till B
	onRenderMs?.(elapsed);
}

// --------------------------------------------------
// Render loop
// --------------------------------------------------

async function renderLoop() {
	if (renderBusy || disposed || !plotlyReady) return;
	renderBusy = true;
	try {
		while (dirty && !disposed) {
			// Markera att aktuell data tas om hand
			dirty = false;

			// Snapshot av senaste data
			const snapshot = latestPoints;

			await render(snapshot);
		}
	} catch (error) {
		console.error("Plotly render error:", error);
	} finally {
		renderBusy = false;

		// Data kan ha ändrats under rendering
		if (dirty && !disposed) {
			requestRender();
		}
	}
}

// --------------------------------------------------
// Render scheduler
// --------------------------------------------------

function requestRender() {
	if (disposed || frameQueued || !plotlyReady) return;
	frameQueued = true;
	requestAnimationFrame(() => {
		frameQueued = false;
		if (disposed) return;
		void renderLoop();
	});
}

// --------------------------------------------------
// Data updates
// --------------------------------------------------

$effect(() => {
	latestPoints = points ?? [];
	dirty = true;
	requestRender();
});

// --------------------------------------------------
// Initialize
// --------------------------------------------------

onMount(() => {
	disposed = false;
	const init = async () => {
		try {
			await loadPlotly();
			if (disposed) return;
			const Plotly = (window as any).Plotly;
			await Plotly.newPlot(
				plotEl,
				[
					{
						type: "scatter3d",
						mode: "markers",
						x: [],
						y: [],
						z: [],
						marker: {
							size: 2,
						},
					},
				],
				{
					margin: {
						l: 0,
						r: 0,
						t: 0,
						b: 0,
					},
				},
				{
					responsive: true,
				},
			);

			if (disposed) {
				Plotly.purge(plotEl);
				return;
			}

			resizeObserver = new ResizeObserver(() => {
				Plotly.Plots.resize(plotEl);
			});

			resizeObserver.observe(plotEl);

			lastFpsTime = performance.now();

			plotlyReady = true;

			// Starta första rendering
			dirty = true;
			requestRender();
		} catch (error) {
			console.error("Plotly initialization error:", error);
		}
	};

	void init();

	return () => {
		disposed = true;

		resizeObserver?.disconnect();

		if ((window as any).Plotly && plotEl) {
			(window as any).Plotly.purge(plotEl);
		}
	};
});
</script>

<div class="window-container">
	<div class="stats">
		FPS:
		<strong>{fps}</strong>

		<br />

		Render:
		<strong>{renderMs.toFixed(1)} ms</strong>

		<br />

		Points per batch:
		<strong>{pointsPerBatch}</strong>

		<br />

		Target:
		<strong>{payload?.updateMs ?? 0} ms</strong>
	</div>

	<div class="graph-container">
		<div bind:this={plotEl} class="plot"></div>
	</div>
</div>

<style>
.window-container {
	width: 100%;
	height: 100%;

	display: flex;
	flex-direction: column;

	min-width: 0;
	min-height: 0;
}

.stats {
	padding: 6px;
	font-size: 12px;
	flex: 0 0 auto;
}

.graph-container {
	flex: 1 1 0%;

	display: flex;
	flex-direction: column;

	min-width: 0;
	min-height: 0;
}

.plot {
	flex: 1 1 0%;

	min-width: 0;
	min-height: 0;

	width: 100%;
	height: 100%;
}
</style>
