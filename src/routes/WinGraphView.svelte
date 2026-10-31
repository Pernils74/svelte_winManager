<!-- WinGraphView.svelte -->

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

	// Rapportera faktisk renderingstid till B
	onRenderMs?: (ms: number) => void;
}

let { win, payload, points, onRenderMs }: Props = $props();

let fps = $state(0);
let renderMs = $state(0);

let frameCount = 0;
let lastTime = performance.now();

let plotEl: HTMLDivElement;
let plotlyReady = $state(false);

let pointsPerBatch = $derived(points?.length ?? 0);

let resizeObserver: ResizeObserver;

// Hindrar gamla renderingsresultat från att rapporteras
let renderSequence = 0;

async function loadPlotly() {
	if ((window as any).Plotly) return;
	const script = document.createElement("script");
	script.src = "https://cdn.plot.ly/plotly-3.1.0.min.js";
	document.head.appendChild(script);
	await new Promise<void>((resolve, reject) => {
		script.onload = () => resolve();
		script.onerror = () =>
			reject(
				new Error("Could not load Plotly"),
			);
	});
}

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
		resizeObserver = new ResizeObserver(() => {
			Plotly.Plots.resize(plotEl);
		});
		resizeObserver.observe(plotEl);
		plotlyReady = true;
	};
	void init();
	return () => {
		renderSequence++;
		resizeObserver?.disconnect();
	};
});

/**
 * Rendera grafen och rapportera verklig tid
 * tillbaka till WinGraph_B.
 */
$effect(() => {
	if (!plotlyReady) return;

	const plotPoints = points ?? [];
	const currentSequence = ++renderSequence;

	const Plotly = (window as any).Plotly;

	frameCount++;
	const now = performance.now();

	if (now - lastTime >= 1000) {
		fps = frameCount;
		frameCount = 0;
		lastTime = now;
	}

	const x = plotPoints.map((p) => p.x);
	const y = plotPoints.map((p) => p.y);
	const z = plotPoints.map((p) => p.z);

	async function render() {
		const t0 = performance.now();
		try {
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

			const elapsed = performance.now() - t0;
			// Rapportera endast senaste renderingen
			if (currentSequence !== renderSequence) {
				return;
			}
			renderMs = elapsed;
			// Skicka mätvärdet till PID-regulatorn i B
			onRenderMs?.(elapsed);
		} catch (error) {
			console.error("Plotly render error:", error);
		}
	}
	void render();
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
