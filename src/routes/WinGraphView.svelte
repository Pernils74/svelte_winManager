<script lang="ts">
import { onMount } from "svelte";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

export type Point3D = {
	x: number;
	y: number;
	z: number;
};

export type PointCloud = {
	count: number;
	x: Float32Array;
	y: Float32Array;
	z: Float32Array;
};

export type GraphConfig = {
	pointsPerBatch: number;
	updateMs: number;
};

export type RenderStats = {
	fps: number;
	renderMs: number;
};

interface Props extends Partial<WindowComponentProps> {
	config?: GraphConfig;
	points?: Point3D[];
	cloud?: PointCloud | null;
	onRenderMs?: (ms: number) => void;
	stats?: RenderStats;
}

let {
	points,
	cloud,
	nextCloud,
	config,
	stats = $bindable({ fps: 0, renderMs: 0 }),
	onRenderMs,
}: Props = $props();

$inspect(nextCloud);

let fps = $state(0);
let renderMs = $state(0);
let plotlyReady = $state(false);
let plotEl: HTMLDivElement;

let pointsPerBatch = $derived(cloud ? cloud.count : (points?.length ?? 0));
let updateMs = $derived(config?.updateMs ?? 0);

// --------------------------------------------------
// Intern state (icke-reaktiv för maximal prestanda)
// --------------------------------------------------

let renderBusy = false;
let dirty = false;
let frameQueued = false;
let disposed = false;

let latestPoints: Point3D[] | undefined;
let latestCloud: PointCloud | null | undefined;
let resizeObserver: ResizeObserver | undefined;

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
	if ((window as any).Plotly) return Promise.resolve();
	if (plotlyLoadPromise) return plotlyLoadPromise;

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
// Rendering & Loop (Drop-frame / Latest-wins)
// --------------------------------------------------

async function renderFrame() {
	const Plotly = (window as any).Plotly;
	if (!Plotly || !plotEl) return;

	let x: number[] | Float32Array;
	let y: number[] | Float32Array;
	let z: number[] | Float32Array;

	if (latestCloud) {
		({ x, y, z } = latestCloud);
	} else if (latestPoints && latestPoints.length > 0) {
		x = latestPoints.map((p) => p.x);
		y = latestPoints.map((p) => p.y);
		z = latestPoints.map((p) => p.z);
	} else {
		x = [];
		y = [];
		z = [];
	}

	const t0 = performance.now();

	await Plotly.react(plotEl, [
		{
			type: "scatter3d",
			mode: "markers",
			x,
			y,
			z,
			marker: {
				size: 2,
				color: z,
				colorscale: "Viridis",
			},
		},
	]);

	if (disposed) return;

	const elapsed = performance.now() - t0;
	renderMs = elapsed;
	updateFps();

	stats.renderMs = elapsed;
	stats.fps = fps;
	onRenderMs?.(elapsed);
}

async function renderLoop() {
	if (renderBusy || disposed || !plotlyReady) return;
	renderBusy = true;

	try {
		while (dirty && !disposed) {
			dirty = false;
			await renderFrame();
			// Ge webbläsarens UI-tråd utrymme för klick och fönsterdragning
			await new Promise((r) => requestAnimationFrame(r));
		}
	} catch (error) {
		console.error("Plotly render error:", error);
	} finally {
		renderBusy = false;
		if (dirty && !disposed) {
			requestRender();
		}
	}
}

function requestRender() {
	if (disposed || frameQueued || !plotlyReady) return;
	frameQueued = true;
	requestAnimationFrame(() => {
		frameQueued = false;
		if (!disposed) void renderLoop();
	});
}

// --------------------------------------------------
// Livscykel & Reaktivitet
// --------------------------------------------------

$effect(() => {
	latestPoints = points;
	latestCloud = cloud;
	dirty = true;
	requestRender();
});

onMount(() => {
	disposed = false;

	const init = async () => {
		try {
			await loadPlotly();
			if (disposed || !plotEl) return;

			const Plotly = (window as any).Plotly;
			await Plotly.newPlot(
				plotEl,
				[{ type: "scatter3d", mode: "markers", x: [], y: [], z: [], marker: { size: 2 } }],
				{ margin: { l: 0, r: 0, t: 0, b: 0 } },
				{ responsive: true },
			);

			if (disposed) {
				Plotly.purge(plotEl);
				return;
			}

			resizeObserver = new ResizeObserver(() => {
				if (!disposed && plotEl) Plotly.Plots.resize(plotEl);
			});
			resizeObserver.observe(plotEl);

			lastFpsTime = performance.now();
			plotlyReady = true;
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
		<span>FPS: <strong>{fps}</strong></span>
		<span>Render: <strong>{renderMs.toFixed(1)} ms</strong></span>
		<span>Points/batch: <strong>{pointsPerBatch}</strong></span>
		<!-- <span>Target: <strong>{updateMs} ms</strong></span> -->
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
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	padding: 6px 8px;
	font-size: 12px;
	background: #f4f4f4;
	border-bottom: 1px solid #ddd;
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
	width: 100%;
	height: 100%;
	min-width: 0;
	min-height: 0;
}
</style>
