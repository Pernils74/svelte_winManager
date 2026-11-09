<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = getWindowManager();
</script>

<h3>🪟 Window Manager Debug</h3>

<table class ="table">
	<thead>
		<tr>
			<th>Title</th>
			<th>WinId</th>
			<th>Parent</th>
			<th>Children</th>
			<th>Detached</th>

			<th>Strategy</th>

			<th>Busy</th>
			<th>Render ms</th>
			<th>Render count</th>
			<th>Dropped</th>

			<th>Details</th>
		</tr>
	</thead>

	<tbody>
		{#each wManager.windows as win (win.winId)}
			<tr>
				<td>{win.title}</td>

				<td>
					<code>{win.winId}</code>
				</td>

				<td>{win.renderTargetWinId ?? "-"}</td>

				<td>
					{wManager.getChildren(win.winId).length}
				</td>

				<td>
					{win.isDetached ? "✅" : "❌"}
				</td>

				<td>
					{win.renderStrategy ?? "immediate"}
				</td>

				<td>
					{win.metrics?.isBusy ? "🔥" : "✅"}
				</td>

				<td>
					{win.metrics?.renderMs?.toFixed(1) ?? "0.0"}
				</td>

				<td>
					{win.metrics?.renderCount ?? 0}
				</td>

				<td>
					{win.metrics?.droppedUpdates ?? 0}
				</td>

				<td>
					<details>
						<summary>info</summary>

						<pre>
            {JSON.stringify({
							renderTargetWinId: win.renderTargetWinId,
            	children: wManager.getChildren(win.winId).map(c => c.winId),
            
            	context: win.context,
            
            	renderStrategy: win.renderStrategy,
            
            	metrics: win.metrics,
            }, null, 2)}
						</pre>
					</details>
				</td>
			</tr>
		{/each}
	</tbody>
</table>
<style>
table {
	width: 100%;
	border-collapse: collapse;
	background-color: #f9f9f9;
}
</style>
