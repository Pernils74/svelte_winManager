<script lang="ts">
import type { WindowComponentProps, WindowInstance } from "#lib/windowManager.svelte.ts";

import GraphView from "./WinGraphView.svelte";

import { getWindowManager } from "#lib/windowManager.svelte.ts";
const wManager = getWindowManager();

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

let config = $derived(payload);

// wManager.detachWindow(
// 	graphWin,
// 	"window",
// );
</script>

<!-- <button
	onclick={() => wManager.detachWindow(
		win,
		"window",
	)}
>
	🪟 Detach
</button> -->

<div class="container">
	<GraphView
		payload={config}
		points={points}
	/>
</div>
<style>
.container {
	width: 100%;
	height: 100%;
	display: flex;
	/* flex: 1 1 0%; */
	flex-direction: column;
}
</style>
