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

import GraphView from "./WinGraphView.svelte";

type Point3D = {
	x: number;
	y: number;
	z: number;
};

interface GraphConfig {
	pointsPerBatch: number;
	updateMs: number;
}

interface Props extends WindowComponentProps {
	win: WindowInstance;
	payload: GraphConfig;
	points: Point3D[];
}

let { win, payload, points }: Props = $props();

// let config = $derived(payload);
let config = $derived(win.payload);

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

function clamp(
	value: number,
	min: number,
	max: number,
): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * PID-regulator.
 *
 * targetMs = önskad renderingstid
 * actualMs = uppmätt renderingstid
 *
 * Ökar batch om renderingen är för snabb.
 * Minskar batch om renderingen är för långsam.
 */
function regulateBatch(actualMs: number) {
	const targetMs = Math.max(1, Number(config.updateMs) || 100);

	if (!Number.isFinite(actualMs) || actualMs <= 0) {
		return;
	}
	actualRenderMs = actualMs;
	const now = performance.now();
	const dt = previousTime > 0 ? clamp((now - previousTime) / 1000, 0.01, 2) : 0.1;
	previousTime = now;
	// Normaliserat reglerfel
	const error = (targetMs - actualMs) / targetMs;
	// Dödzon för att undvika små oscillationer
	if (Math.abs(error) < DEAD_BAND) {
		controllerStatus = "Target reached";
		batchAdjustment = 0;
		previousError = error;
		return;
	}
	// Integral med anti-windup
	integral = clamp(
		integral + error * dt,
		-3,
		3,
	);
	// Derivatadel
	const derivative = (error - previousError) / dt;
	previousError = error;
	// PID-utgång
	const pid = KP * error +
		KI * integral +
		KD * derivative;

	// Begränsa förändring till max 20 % per cykel
	const adjustment = clamp(
		pid,
		-MAX_STEP,
		MAX_STEP,
	);
	const currentBatch = Math.max(
		MIN_BATCH,
		Math.round(Number(config.pointsPerBatch) || 1),
	);
	const newBatch = Math.round(
		clamp(
			currentBatch * (1 + adjustment),
			MIN_BATCH,
			MAX_BATCH,
		),
	);
	batchAdjustment = newBatch - currentBatch;
	if (newBatch !== currentBatch) {
		// Ändrar samma reaktiva config som A använder
		config.pointsPerBatch = newBatch;
	}
	if (error < 0) {
		controllerStatus = "Reducing batch";
	} else {
		controllerStatus = "Increasing batch";
	}
}

/**
 * Anropas från GraphView efter varje Plotly-rendering.
 */
function onRenderMs(ms: number) {
	regulateBatch(ms);
}
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
		payload={config}
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
