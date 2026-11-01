
<!-- https://github.com/Pernils74/svelte_winManager/blob/dev_refactoring/src/routes/MouseCords.svelte -->
<!-- MouseCords.svelte -->
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";

let mouseX = $state(0);
let mouseY = $state(0);
let showPopup = $state(true);
let elType = $state("");
let hoveredClass = $state("");
let position = $state("");

let winid = $state("");
let parentId = $state("");
let zIndex = $state(0);
let winWidth = $state(0);
let winHeight = $state(0);
let winLeft = $state(0);
let winTop = $state(0);

let rect = $state<DOMRect | null>(null);
let isInsideFrame = $state(false);
let isInsideContent = $state(false);

const wManager = getWindowManager();

function onMouseOver(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target) return;

	// Basinfo om det råa HTML-elementet under muspekaren
	elType = target.tagName;
	hoveredClass = target.className?.toString() ?? "";
	position = window.getComputedStyle(target).position;
	rect = target.getBoundingClientRect();

	// 🌟 Leta upp närmaste fönsterram och dess content-yta baserat på nya refactoringen
	const frame = target.closest(".window-frame") as HTMLElement | null;
	const content = target.closest(".content") as HTMLElement | null;

	// Ta bort gamla debug-highlights
	document.querySelectorAll(".window-frame, .content")
		.forEach((el) => el.classList.remove("debug-highlight-frame", "debug-highlight-content"));

	isInsideFrame = !!frame;
	isInsideContent = !!content;

	if (frame) {
		frame.classList.add("debug-highlight-frame");

		// Hämta det unika fönster-ID:t från data-attributet
		const winidAttr = frame.getAttribute("data-window-id");
		if (winidAttr) {
			winid = winidAttr;

			// Slå upp det reaktiva fönsterobjektet i din manager för mer djupgående debug-data
			const win = wManager.find(winid);
			if (win) {
				parentId = win.parentId ?? "root";
				zIndex = win.zIndex;
				winHeight = win.state.height;
				winWidth = win.state.width;
				winLeft = win.state.left;
				winTop = win.state.top;
			}
		}
	} else {
		winid = "";
		parentId = "";
		zIndex = 0;
		winHeight = 0;
		winWidth = 0;
		winLeft = 0;
		winTop = 0;
	}

	if (content) {
		content.classList.add("debug-highlight-content");
	}
}
</script>

<svelte:window
	onmousemove={(e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }}
	onmouseover={onMouseOver}
/>

{#if showPopup}
  <div
	style="
      position: fixed;
      top: {mouseY + 15}px;
      left: {mouseX + 15}px;
      background: rgba(30, 41, 59, 0.95);
      color: #f8fafc;
      border: 1px solid #475569;
      border-radius: 8px;
      padding: 0.75rem;
      font-size: 0.8rem;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      pointer-events: none;
      z-index: 999999; /* Ligga absolut överst av allt */
      max-width: 300px;
      font-family: monospace;
    "
>
    <div style="font-weight: bold; color: #38bdf8; border-bottom: 1px solid #475569; padding-bottom: 0.25rem; margin-bottom: 0.5rem;">
      🔍 WINDOW INSPECTOR
    </div>
    
    <div style="display: grid; grid-template-columns: 90px 1fr; gap: 0.25rem;">
      <span>XY:</span> <span style="color: #f43f5e;">{mouseX}px, {mouseY}px</span>
      <span>Element:</span> <span style="color: #a78bfa;">{elType.toLowerCase()}</span>
      <span>Position:</span> <span>{position}</span>
    </div>

    {#if winid}
      <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed #475569; display: grid; grid-template-columns: 90px 1fr; gap: 0.25rem;">
        <span style="color: #38bdf8; font-weight: bold;">winId:</span> 
        <span style="color: #38bdf8; font-size: 0.75rem; word-break: break-all;">{winid}</span>
        
        <span style="color: #fbbf24;">parentId:</span> 
        <span style="color: #fbbf24; font-size: 0.75rem; word-break: break-all;">{parentId}</span>
        
        <span style="color: #34d399;">z-index:</span> 
        <span style="color: #34d399; font-weight: bold;">{zIndex}</span>

        <span style="color: #34d399;">wi X hei:</span> 
        <span style="color: #34d399; font-weight: bold;">{winWidth} X {winHeight}</span>

        <span style="color: #34d399;">le X to:</span> 
        <span style="color: #34d399; font-weight: bold;">{winLeft} X {winTop}</span>

      </div>
    {/if}

    <div style="margin-top: 0.5rem; display: flex; gap: 0.5rem; font-size: 0.7rem;">
      <span style="padding: 0.1rem 0.3rem; border-radius: 4px; background: {isInsideFrame ? '#0284c7' : '#334155'};">Frame</span>
      <span style="padding: 0.1rem 0.3rem; border-radius: 4px; background: {isInsideContent ? '#16a34a' : '#334155'};">Content</span>
    </div>
  </div>
{/if}

<style>
/* Globala debug-overlays som läggs till dynamiskt under hovring */
:global(.debug-highlight-frame) {
	outline: 2px solid #38bdf8 !important;
	outline-offset: -2px !important;
}

:global(.debug-highlight-content) {
	outline: 1px dashed #34d399 !important;
	outline-offset: -4px !important;
}
</style>
