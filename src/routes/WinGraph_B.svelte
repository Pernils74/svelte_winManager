<script lang="ts">
import type { WindowComponentProps, WindowInstance } from "#lib/windowManager.svelte.ts";

import GraphView from "./WinGraphView.svelte";

interface Props extends WindowComponentProps {
	win: WindowInstance;
	pointsPerBatch: number;
	updateMs: number;
}

let { win, pointsPerBatch, updateMs }: Props = $props();
</script>

<div class="container">
	<GraphView
		payload={win.payload}
		pointsPerBatch={pointsPerBatch}
		updateMs={updateMs}
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
