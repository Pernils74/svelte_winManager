<!-- https://github.com/Pernils74/svelte_winManager/blob/dev_refactoring/src/lib/WindowHost.svelte
https://github.com/Pernils74/svelte_winManager/blob/dev_refactoring/src/routes/%2Bpage.svelte -->

<!-- WindowHost.svelte -->
<script lang="ts">
import { type Component, onMount, type Snippet, tick } from "svelte";
import { page } from "$app/state";

import WindowFrame from "./WindowFrame.svelte";
import {
	getWindowManager,
	WINDOW_MANAGER_ROOT_ID,
	type WindowInstance,
	type WindowState,
} from "./windowManager.svelte";

import { getComponentByKey } from "./windowComponentRegistry";

// import { registerComponents } from "./windowRegistry";

//🟢 Registrera alla fönsterkomponenter här istället för i +page.svelte
// registerComponents(
// 	import.meta.glob(
// 		["/src/routes/**/*.svelte", "!/src/routes/**/+*.svelte"],
// 		{ eager: true },
// 	),
// );

interface Props {
	desktopContent?: Snippet; // 🌟 Desktop content in root window
	topbarContent?: Snippet; // 🌟 Topbar content in root window
}
let { desktopContent, topbarContent }: Props = $props();

const detachedRootWinId = page.url.searchParams.get("winId");
const isStandalone = detachedRootWinId !== null;

const wManager = getWindowManager(); // ligger i try catch block och kommer skapa ny om den inte finns

const descriptors = detachedRootWinId ? wManager.backend.getInitialStateFor(detachedRootWinId) : [];

// Reading of URL-parametrar for standalone windows (win.isDetached=true)
let standaloneWinId = $derived(page.url.searchParams.get("winId"));
// let standaloneComponentKey = $derived(page.url.searchParams.get("componentKey"));
// let standaloneRenderTargetWinId = $derived(
// 	page.url.searchParams.get("renderTargetWinId") ??
// 		page.url.searchParams.get("parentId"),
// );
// let standaloneParentId = $derived(page.url.searchParams.get("parentId"));
// let standaloneTitle = $derived(page.url.searchParams.get("title") ?? "Fristående");
// let standaloneManagerId = page.url.searchParams.get("wManagerId");

// Komponenten laddas asynkront från windowRegistry.

let standaloneLoading = $state(false);

let contentEl = $state<HTMLElement | undefined>(undefined);
let rootContentEl = $state<HTMLElement | undefined>();

let winCount = $derived(wManager.winCount);

// let minimizedWindows = $derived(
// 	wManager.windows.filter(
// 		(win) =>
// 			win.winId !== WINDOW_MANAGER_ROOT_ID &&
// 			win.isMinimized,
// 	),
// );

let minimizedWindows = $derived(
	wManager.windows.filter(
		(win) =>
			win.winId !== WINDOW_MANAGER_ROOT_ID &&
			win.renderTargetWinId === WINDOW_MANAGER_ROOT_ID &&
			win.isMinimized,
	),
);

onMount(() => {
	if (descriptors.length === 0) return; // Kollar om det är ett detached subtree

	void (async () => {
		const rootWin = await wManager.restoreSubtree(
			descriptors,
		);

		// Vänta en tick så att rootContentEl säkert är bunden i DOM:en
		// await tick();

		// if (rootWin && rootContentEl && !rootWin.isMaximized) {
		// 	wManager.toggleMaximize(rootWin, rootContentEl);
		// }

		console.log(
			"restore",
			descriptors.map((d) => ({
				title: d.title,
				winId: d.winId,
				parentId: d.parentId,
				renderTargetWinId: d.renderTargetWinId,
				wManagerId: d.wManagerId,
			})),
		);

		console.log(
			"all windows",
			wManager.windows.map((w) => ({
				title: w.title,
				winId: w.winId,
				parentId: w.parentId,
				renderTargetWinId: w.renderTargetWinId,
				wManagerId: w.wManagerId,
			})),
		);
	})();
});

onMount(() => {
	if (!rootContentEl) {
		console.warn("[WindowHost] contentEl is undefined on mount. Cannot set root bounds.");
		return;
	}
	wManager.setBoundingEl(WINDOW_MANAGER_ROOT_ID, rootContentEl);
	const updateBounds = () => {
		if (!contentEl) return;
		wManager.setRootBounds(
			contentEl.clientWidth,
			contentEl.clientHeight,
		);
	};

	updateBounds();
	const observer = new ResizeObserver(updateBounds);
	observer.observe(rootContentEl);

	return () => {
		observer.disconnect();
		wManager.setBoundingEl(WINDOW_MANAGER_ROOT_ID, null);
	};
});

const onFocus = () => {
	publishStandaloneStateUpdate({ isFocused: true });
};

const onBlur = () => {
	publishStandaloneStateUpdate({ isFocused: false });
};

const onResize = () => {
	if (!isStandalone) return;
	publishStandaloneStateUpdate({
		width: window.innerWidth,
		height: window.innerHeight,
	});
};

const onVisibility = () => {
	publishStandaloneStateUpdate({
		isMinimized: document.hidden,
	});
};

function publishStandaloneStateUpdate(
	updates: Partial<WindowState>,
): void {
	if (!isStandalone || !standaloneWinId) return;

	wManager.updateState(standaloneWinId, updates, { publish: false });
	void wManager
		.sendWindowStateUpdate(standaloneWinId, updates)
		.catch((error) => {
			console.error(
				`[WindowHost] Kunde inte synka fönstertillstånd för ${standaloneWinId}:`,
				error,
			);
		});
}
</script>

<!-- Vi sätter en CSS-klass på layouten om vi är standalone så vi kan dölja topbar/taskbar via CSS eller villkor -->

<svelte:window
	onresize={onResize}
	onfocus={onFocus}
	onblur={onBlur}
	onvisibilitychange={onVisibility}
/>

<div class="layout" class:standalone-host={isStandalone}>
	{#if !isStandalone}
		<header class="topbar">
			{#if topbarContent}
				{@render topbarContent()}
			{/if}
			<span>Current open windows: {winCount}</span>
		</header>
	{/if}

	{#snippet renderWindow(win: WindowInstance)}
		{#if win.component}
			{@const WindowComponent = win.component}
			{@const globalIdx = wManager.windows.findIndex(w => w.winId === win.winId)}
			{@const parentInstance = wManager.find(win.renderTargetWinId)}


			<WindowFrame
				{win}
				bounds={parentInstance?.boundingEl ?? rootContentEl!}
			>
				<WindowComponent
					bind:win={wManager.windows[globalIdx]}
					winId={win.winId}
					parentId={win.parentId}
					renderTargetWinId={win.renderTargetWinId}
					{...win.props}
				/>

				{#each wManager.getChildren(win.winId) as child (child.winId)}
					{#if !child.isMinimized && win.wManagerId === wManager.wManagerId}
						{@render renderWindow(child)}  // Anropar sig själv rekursivt
					{:else}
						{console.log(`Child window ${child.winId} is minimized or detached, skipping render.`)}
					{/if}
				{/each}
			</WindowFrame>
		{/if}
	{/snippet}









<!-- src/lib/WindowHost.svelte -->
<main class="workspace" bind:this={rootContentEl}>
	{#if rootContentEl }
		{#if isStandalone}
			{#if standaloneLoading}
				<div class="loading">
					Laddar...
				</div>
			{:else}
				{@const standaloneWin = wManager.find(standaloneWinId)}
				{#if standaloneWin && !standaloneWin.isMinimized}
					{@render renderWindow(standaloneWin)}
				{/if}	 
			{"}"}	 
		{/if}

		{:else}
			<!-- 1. Rendera alla vanliga rot-fönster -->
			{#each wManager.getChildren(WINDOW_MANAGER_ROOT_ID) as win (win.winId)}
				{#if !win.isMinimized && 	win.wManagerId === wManager.wManagerId}
					{@render renderWindow(win)}
				{/if}
			{/each}

			<!-- 🟢 2. RENDERA ALLA FORÄLDRALÖSA FÖNSTER SEPARAT HÄR -->
			{#each wManager.getOrphanWorkspaceWindows() as orphanWin (orphanWin.winId)}
				{console.log("oprphant ", orphanWin.winId)}
				{@render renderWindow(orphanWin)}
			{/each}

			{#if desktopContent}
				{@render desktopContent()}
			{/if}
		{/if}

	{/if}
</main>








	<!-- {#if !isStandalone && minimizedWindows.length > 0} -->
	{#if minimizedWindows.length > 0}
		<footer class="taskbar">
			<span class="taskbar-label">
				Minimerade fönster
			</span>
			{#each minimizedWindows as win (win.winId)}
				<div class="task-item">
					<button
						type="button"
						class="task-btn"
						aria-label={`Återställ ${win.title}`}
						onclick={() => wManager.restore(win)}
					>
						<span class="task-icon"> 
							<!-- {#if win.viewPort.type === "workspace"}
								🪟
							{:else if win.viewPort.type === "browser-tab"}
								🌐
							{:else if win.viewPort.type === "tauri-window"}
								🖥️
							{/if} -->

						 ◫ </span>

						<!-- <span class="task-icon"> ◫ </span> -->
						<span class="task-title"> {win.title} </span>
					</button>

					<div
						class="thumbnail-popup"
						aria-hidden="true"
					>
						<div class="thumbnail-heading">
							{win.title}
						</div>
						{#if win.thumbnail}
							<img
								class="thumbnail-image"
								src={win.thumbnail}
								alt=""
							/>
						{:else}
							<div class="thumbnail-placeholder">
								Förhandsvisning saknas
							</div>
						{/if}
					</div>

				</div>
			{/each}

		</footer>
	{/if}

</div>
<style>
/* Snabba CSS-justeringar för att städa upp standalone-läget */
.standalone-host .workspace {
	position: absolute;
	inset: 0;
	width: 100vw;
	height: 100vh;
	background: #1e1e1e;
}

.loading {
	color: white;
	display: grid;
	place-content: center;
	gap: 0.75rem;
	min-height: 100%;
	padding: 1.5rem;
	box-sizing: border-box;
	font-family: sans-serif;
	text-align: center;
}

.layout {
	position: absolute;
	inset: 0;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	border: 2px solid black;
	box-sizing: border-box;
}

.topbar {
	position: relative;
	z-index: 10;
	flex: 0 0 2.5rem;
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 0 0.75rem;
	background: lightblue;
	border-bottom: 1px solid #999;
}

.workspace {
	position: relative;
	flex: 1 1 auto;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
	isolation: isolate;
}

.taskbar {
	position: relative;
	z-index: 100;
	flex: 0 0 2.5rem;
	display: flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0 0.75rem;
	background: #c1414165;
	border-top: 1px solid #999;
	overflow: visible;
}

.taskbar-label {
	margin-right: 0.5rem;
	white-space: nowrap;
	color: white;
}

.task-item {
	position: relative;
	align-self: stretch;
	display: flex;
	align-items: center;
}

.task-btn {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	height: 2rem;
	max-width: 180px;
	padding: 0 0.65rem;
	border: 1px solid #777;
	border-radius: 5px;
	background: #ffffffd9;
	color: #222;
	cursor: pointer;
}

.task-btn:hover,
.task-btn:focus-visible {
	background: white;
	border-color: #3578c7;
}

.task-icon {
	display: inline-grid;
	place-items: center;
	flex: 0 0 24px;
	width: 24px;
	height: 24px;
	border-radius: 4px;
	background: #dce9fa;
	font-size: 1.1rem;
}

.task-title {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.thumbnail-popup {
	position: absolute;
	left: 50%;
	bottom: calc(100% + 0.6rem);
	z-index: 1000;
	width: 280px;
	padding: 8px;
	border: 1px solid #b7b7b7;
	border-radius: 9px;
	background: #f8f8f8;
	box-shadow: 0 8px 28px rgb(0 0 0 / 24%);
	opacity: 0;
	visibility: hidden;
	pointer-events: none;
	transform: translate(-50%, 8px) scale(0.97);
	transform-origin: bottom center;
	transition:
		opacity 140ms ease,
		transform 140ms ease,
		visibility 140ms ease;
}

.task-item:hover .thumbnail-popup,
.task-item:focus-within .thumbnail-popup {
	opacity: 1;
	visibility: visible;
	transform: translate(-50%, 0) scale(1);
}

.thumbnail-heading {
	padding: 3px 4px 8px;
	color: #222;
	font-size: 0.85rem;
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.thumbnail-image,
.thumbnail-placeholder {
	display: block;
	width: 100%;
	aspect-ratio: 16 / 10;
	box-sizing: border-box;
	background: #e6e6e6;
	border: 1px solid #ccc;
	border-radius: 4px;
}

.thumbnail-image {
	object-fit: contain;
}

.thumbnail-placeholder {
	display: grid;
	place-content: center;
	border-style: dashed;
	color: #666;
	font-size: 0.8rem;
	text-align: center;
}

@media (prefers-reduced-motion: reduce) {
	.thumbnail-popup {
		transition: none;
	}
}
</style>
