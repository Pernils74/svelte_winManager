<!-- WinGraphView.svelte -->

<script lang="ts">
import { onMount } from "svelte";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
import { getWindowManager } from "#lib/windowManager.svelte.ts";
const wManager = getWindowManager();

type Point3D = {
	x: number;
	y: number;
	z: number;
};

type GraphConfig = {
	pointsPerBatch: number;
	updateMs: number;
};

type GraphPayload = {
	points: Point3D[];
};

interface Props extends Partial<WindowComponentProps> {
	payload?: GraphConfig;
	points?: Point3D[];
}

let { win, payload, points }: Props = $props();

let fps = $state(0);
let renderMs = $state(0);

let frameCount = 0;
let lastTime = performance.now();

let plotEl: HTMLDivElement;
let plotlyReady = $state(false);

let pointsPerBatch = $derived(points?.length);

async function loadPlotly() {
	if ((window as any).Plotly) return;
	const script = document.createElement("script");
	script.src = "https://cdn.plot.ly/plotly-3.1.0.min.js";
	document.head.appendChild(script);
	await new Promise<void>((resolve) => {
		script.onload = () => resolve();
	});
}
let resizeObserver: ResizeObserver;

onMount(() => {
	const init = async () => {
		await loadPlotly();
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
				margin: { l: 0, r: 0, t: 0, b: 0 },
			},
			{
				responsive: true,
			},
		);
		resizeObserver = new ResizeObserver(() => {
			Plotly.Plots.resize(plotEl);
		});
		resizeObserver.observe(plotEl);
		plotlyReady = true;
	};
	void init();
	return () => {
		resizeObserver?.disconnect();
	};
});

$effect(() => {
	if (!plotlyReady) return;
	frameCount++;
	const now = performance.now();
	if (now - lastTime >= 1000) {
		fps = frameCount;
		frameCount = 0;
		lastTime = now;
	}
	const t0 = performance.now();
	const plotPoints = points ?? [];
	(window as any).Plotly.react(
		plotEl,
		[
			{
				type: "scatter3d",
				mode: "markers",

				x: plotPoints.map((p) => p.x),
				y: plotPoints.map((p) => p.y),
				z: plotPoints.map((p) => p.z),

				marker: {
					size: 2,
				},
			},
		],
	);
	renderMs = performance.now() - t0;
});
</script>
<div class = "window-container">
	<div class="stats">
	    FPS: <strong>{fps} </strong>
	<br />
        Render:<strong> {renderMs.toFixed(1)} ms	</strong> <br>
        Points per batch:<strong>    {pointsPerBatch}</strong>
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
