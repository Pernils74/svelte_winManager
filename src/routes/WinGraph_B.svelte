<!-- WinGraph_B.svelte -->
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
import { onMount } from "svelte";
import GraphView, { type PointCloud, type RenderStats } from "./WinGraphView.svelte";

type WinGraphBProps = {
	pointsPerBatch: number;
	updateMs: number;
	cloud: PointCloud | null;
	onSetBatch?: (newBatch: number) => void;
};

let { pointsPerBatch = 5000, updateMs = 50, cloud = null, onSetBatch }:
	& WindowComponentProps<WinGraphBProps>
	& WinGraphBProps = $props();

let stats = $state<RenderStats>({ fps: 0, renderMs: 0 });

let actualRenderMs = $state(0);
let batchAdjustment = $state(0);
let autoRegulate = $state(true);

function regulateBatch(actualMs: number) {
	if (!autoRegulate || actualMs <= 0) return;

	const ratio = updateMs / actualMs;
	// Dödzon ±15% så regulatorn ligger still när målet är nått
	if (Math.abs(1 - ratio) < 0.15) {
		batchAdjustment = 0;
		return;
	}

	// Mjuk rampning: max ±20% ändring per steg
	const clampedRatio = Math.max(0.8, Math.min(ratio, 1.2));
	const nextBatch = Math.max(100, Math.min(Math.round(pointsPerBatch * clampedRatio), 100000));

	batchAdjustment = nextBatch - pointsPerBatch;
	if (nextBatch !== pointsPerBatch) {
		onSetBatch?.(nextBatch);
	}
}

function onRenderMs(ms: number) {
	actualRenderMs = ms;
	regulateBatch(ms);
}
</script>

<div class="container">
	<div class="controller">
		<div>
				Target:
				<strong>{updateMs} ms</strong>
			</div>
		<div>
				Render:				
				<strong>{stats.renderMs.toFixed(1)} ms</strong>
			</div>
		<div>
				Points/batch:
				<strong>{pointsPerBatch}</strong>
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
		cloud={cloud}
		bind:stats
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
