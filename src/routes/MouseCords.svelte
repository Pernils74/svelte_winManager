
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";

import { getComponentKey } from "#lib/windowComponentRegistry.ts";

const wManager = getWindowManager();

let showPopup = $state(true);
let expanded = $state(true);

// Mouse coordinates
let mouseX = $state(0);
let mouseY = $state(0);

// Selected window
let winId = $state("");
let renderTargetWinId = $state("");

// Window position
let winX = $state(0);
let winY = $state(0);

// Runtime information
let runtimeType = $state("");
let runtimeId = $state("");

let componentKey = $state("");

function inspect(target: HTMLElement) {
	// Ignore the inspector itself
	if (target.closest(".window-inspector")) return;

	const frame = target.closest(
		".window-frame",
	) as HTMLElement | null;

	if (!frame) {
		resetWindow();
		return;
	}

	const id = frame.getAttribute("data-window-id");

	if (!id) {
		resetWindow();
		return;
	}

	const win = wManager.find(id);

	if (!win) {
		resetWindow();
		return;
	}

	winId = win.winId;
	renderTargetWinId = win.renderTargetWinId ?? "root";

	winX = win.rect.left;
	winY = win.rect.top;

	runtimeType = win.runtime?.type ?? "unknown";
	runtimeId = win.runtime?.id ?? "";

	componentKey = win.componentKey;
}

function resetWindow() {
	winId = "";
	renderTargetWinId = "";

	winX = 0;
	winY = 0;

	runtimeType = "";
	runtimeId = "";
}

function onMouseMove(event: MouseEvent) {
	mouseX = event.clientX;
	mouseY = event.clientY;
}

function onMouseOver(event: MouseEvent) {
	const target = event.target;

	if (!(target instanceof HTMLElement)) return;

	inspect(target);
}

function togglePopup() {
	showPopup = !showPopup;
}
</script>

<svelte:window
	onmousemove={onMouseMove}
	onmouseover={onMouseOver}
/>

{#if showPopup}
	<div
	class="window-inspector"
	style:left="{Math.min(
			mouseX + 15,
			(typeof window !== 'undefined' ? window.innerWidth : 400) - 350
		)}px"
	style:top="{Math.min(
			mouseY + 15,
			(typeof window !== 'undefined' ? window.innerHeight : 600) - 220
		)}px"
>
		<!-- Header -->
		<div class="header">
			<div>
				<strong>🔍 WINDOW INSPECTOR</strong>
				<span class="subtitle">Window identity & runtime</span>
			</div>

			<div class="header-actions">
				<button
					onclick={() => (expanded = !expanded)}
					title="Expand / collapse"
				>
					{expanded ? "−" : "+"}
				</button>

				<button
					onclick={togglePopup}
					title="Close inspector"
				>
					×
				</button>
			</div>
		</div>

		{#if expanded}
			<div class="body">
				<!-- Mouse -->
				<section>
					<h4>🖱 Mouse</h4>

					<div class="grid">
						<span>Client X</span>
						<b>{mouseX}</b>

						<span>Client Y</span>
						<b>{mouseY}</b>
					</div>
				</section>

				<!-- Window -->
				<section>
					<h4>🪟 Window</h4>

					{#if winId}
						<div class="grid">
							<span>winId</span>
							<b class="blue wrap">{winId}</b>

							<span>renderTargetWinId</span>
							<b class="yellow wrap">{renderTargetWinId}</b>

							<span>Position X</span>
							<b>{winX}</b>

							<span>Position Y</span>
							<b>{winY}</b>
						</div>
					{:else}
						<div class="empty">
							No window selected
						</div>
					{/if}
				</section>

				<!-- Runtime -->
				<section>
					<h4>⚙️ Runtime</h4>

					{#if winId}
						<div class="grid">
							<span>Status</span>
							<b class:active={runtimeType !== "unknown"}>
								{runtimeType}
							</b>

							<span>Runtime ID</span>
							<b class="wrap">{runtimeId || "—"}</b>
						</div>
					{:else}
						<div class="empty">
							No runtime selected
						</div>
					{/if}
				</section>

				<section>
					<h4>📦 ComponentKey</h4>
				
					{#if winId}
						<div class="grid">
							<span>Component Key</span>
							<b class="blue wrap">
								{componentKey || "—"}
							</b>
						</div>
					{:else}
						<div class="empty">
							No component selected
						</div>
					{/if}
				</section>



			</div>
		{/if}
	</div>
{/if}

<style>
.window-inspector {
	position: fixed;
	z-index: 999999;
	width: 330px;
	max-height: 85vh;
	overflow: hidden;
	display: flex;
	flex-direction: column;

	background: rgba(15, 23, 42, 0.97);
	color: #f8fafc;

	border: 1px solid #475569;
	border-radius: 9px;
	box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);

	font: 11px/1.4 monospace;
	pointer-events: auto;
}

.header {
	display: flex;
	justify-content: space-between;
	align-items: center;

	padding: 9px;
	background: #1e293b;
	border-bottom: 1px solid #475569;
	color: #38bdf8;
}

.subtitle {
	display: block;
	color: #94a3b8;
	font-size: 9px;
}

.header-actions {
	display: flex;
	gap: 4px;
}

button {
	cursor: pointer;
	background: #334155;
	color: white;
	border: 1px solid #64748b;
	border-radius: 4px;
	padding: 3px 7px;
	font: inherit;
}

button:hover {
	background: #475569;
}

.body {
	overflow-y: auto;
	padding: 7px;
}

section {
	padding: 7px 0;
	border-bottom: 1px solid #334155;
}

h4 {
	margin: 0 0 6px;
	color: #38bdf8;
	font-size: 11px;
}

.grid {
	display: grid;
	grid-template-columns: 100px minmax(0, 1fr);
	gap: 4px;
}

.grid span {
	color: #94a3b8;
}

.grid b {
	color: #e2e8f0;
	overflow-wrap: anywhere;
}

.wrap {
	word-break: break-all;
}

.blue {
	color: #38bdf8 !important;
}

.yellow {
	color: #fbbf24 !important;
}

.active {
	color: #34d399 !important;
}

.empty {
	color: #94a3b8;
	padding: 5px 0;
}
</style>
