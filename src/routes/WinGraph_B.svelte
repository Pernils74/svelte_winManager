<!-- WinGraph_B.svelte -->
<!--

https://github.com/Pernils74/svelte_winManager/blob/dev/src/lib/WindowFrame.svelte
https://github.com/Pernils74/svelte_winManager/blob/dev/src/lib/WindowHost.svelte
https://github.com/Pernils74/svelte_winManager/blob/dev/src/lib/windowManager.svelte.ts

https://github.com/Pernils74/svelte_winManager/blob/dev/src/lib/windowRegistry.ts
https://github.com/Pernils74/svelte_winManager/blob/dev/src/lib/windowBackend.ts


https://github.com/Pernils74/svelte_winManager/blob/dev/src/routes/WinGraph_A.svelte
https://github.com/Pernils74/svelte_winManager/blob/dev/src/routes/WinGraph_B.svelte
https://github.com/Pernils74/svelte_winManager/blob/dev/src/routes/WinGraphView.svelte


-->

<script lang="ts">
import type { WindowComponentProps, WindowInstance } from "#lib/windowManager.svelte.ts";
import { onMount } from "svelte";

import GraphView from "./WinGraphView.svelte";

type Point3D = {
	x: number;
	y: number;
	z: number;
};

interface GraphConfig extends Record<string, number> {
	pointsPerBatch: number;
	updateMs: number;
}

interface Props extends WindowComponentProps<GraphConfig> {
	win: WindowInstance<GraphConfig>;
	points: Point3D[];
}

let { win, winId, renderTargetWinId, points }: Props = $props();

let config = $derived((win.props as GraphConfig) ?? { pointsPerBatch: 1000, updateMs: 100 });

// PID-parametrar
const KP = 0.35;
const KI = 0.06;
const KD = 0.01;

// Regulatorbegränsningar
const MIN_BATCH = 1;
const MAX_BATCH = 100000;
const MAX_STEP = 0.20;
const DEAD_BAND = 0.02;

// PID-tillstånd
let integral = 0;
let previousError = 0;
let previousTime = 0;

let actualRenderMs = $state(0);
let batchAdjustment = $state(0);
let controllerStatus = $state("Waiting");

let longTaskMs = 0;
let longTaskCount = 0;

let totalLongTasks = $state(0);
let lastLongTaskMs = $state(0);

let longTaskObserver: PerformanceObserver | undefined;

function clamp(
	value: number,
	min: number,
	max: number,
): number {
	return Math.max(min, Math.min(max, value));
}

function startPerformanceMonitor() {
	if (
		!PerformanceObserver.supportedEntryTypes?.includes("longtask")
	) {
		console.warn("Long Task API not supported");
		return;
	}

	longTaskObserver = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			longTaskMs += entry.duration;
			longTaskCount++;
		}
	});

	longTaskObserver.observe({
		type: "longtask",
		buffered: false,
	});
}

function regulateBatch(actualMs: number) {
	const targetMs = config.updateMs;
	if (actualMs <= 0) return;
	const current = config.pointsPerBatch;
	const estimated = Math.round(
		current *
			(targetMs / actualMs),
	);
	config.pointsPerBatch = Math.max(
		1,
		Math.min(
			estimated,
			100000,
		),
	);
}

/**
 * Anropas från GraphView efter varje Plotly-rendering.
 */
function onRenderMs(ms: number) {
	win.metrics.renderMs = ms;
	regulateBatch(ms);
}

onMount(() => {
	if (
		!PerformanceObserver.supportedEntryTypes?.includes("longtask")
	) {
		controllerStatus = "Long Task API unavailable";
		return;
	}

	longTaskObserver = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			longTaskMs += entry.duration;
			longTaskCount++;

			totalLongTasks++;
			lastLongTaskMs = entry.duration;
		}
	});

	longTaskObserver.observe({
		type: "longtask",
		buffered: false,
	});

	return () => {
		longTaskObserver?.disconnect();
	};
});
</script>

<div class="container">
	<div class="controller">
		<div>

			

				Target:
				<strong>{config.updateMs} ms</strong>
			</div>
		<div>
				Render:
				<strong>{actualRenderMs.toFixed(1)} ms</strong>
			</div>
		<div>
				Points/batch:
				<strong>{config.pointsPerBatch}</strong>
			</div>
		<div>
				PID:
				<strong>{controllerStatus}</strong>
			</div>
		<div>
				Batch adjustment:
				<strong>
					{batchAdjustment > 0 ? "+" : ""}
					{batchAdjustment}
				</strong>
			</div>
	</div>

	<GraphView
		points={points}
		onRenderMs={onRenderMs}
	/>
</div>

<style>
.container {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	min-width: 0;
	min-height: 0;
}

.controller {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	padding: 8px;
	font-size: 12px;
	background: #202020;
	color: white;
}

.controller strong {
	color: #65d6a0;
}
</style>
