<!-- WindowRegistryDebug.svelte -->
<script lang="ts">
import type { WindowManager } from "./windowManager.svelte";

interface Props {
	wManager: WindowManager;
	title?: string;
}

let {
	wManager,
	title = "Window Registry",
}: Props = $props();
</script>

<div class="registry-debug">
	<h4>{title}</h4>

	<p>
		Antal fönster:
		<strong>{wManager.winCount}</strong>
	</p>

	<table>
		<thead>
			<tr>
				<th>WinId</th>
				<th>Parent</th>
				<th>wManagerId</th>
				<th>Detached</th>
			</tr>
		</thead>

		<tbody>
			{#each wManager.windows as win (win.winId)}
				<tr>
					<td>{win.winId}</td>
					<td>{win.parentId ?? "ROOT"}</td>
					<td>{win.wManagerId}</td>
					<td>{wManager.find(win.parentId)?.wManagerId != wManager.wManagerId ? "✅" : ""}</td> 
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
.registry-debug {
	font-size: 11px;
	background: white;
	border: 1px solid #ccc;
	padding: 8px;
	overflow: auto;
}

table {
	width: 100%;
	border-collapse: collapse;
}

th,
td {
	border: 1px solid #ddd;
	padding: 2px 4px;
	text-align: left;
}

th {
	background: #f0f0f0;
}
</style>
