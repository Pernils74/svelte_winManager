<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

type Point3D = {
	x: number;
	y: number;
	z: number;
};

interface Props extends WindowComponentProps {
	payload?: { points: Point3D[] };
	maxPoints?: number;
}

let { win, maxPoints = 5000 }: Props = $props();
</script>

<h4>Graph Debug</h4>

<div>
	Points:
	<strong>{win.payload?.points.length ??0}</strong>
</div>

<div>
	MaxPoints:
	<strong>{maxPoints}</strong>
</div>

<div>
	Showing:
	<strong>
		{Math.min(win.payload?.points.length ??0, maxPoints)}
	</strong>
</div>

<pre>
{JSON.stringify(win.payload?.points.at(-1) ?? null, null, 2)}
</pre>
