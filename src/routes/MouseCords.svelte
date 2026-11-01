
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = getWindowManager();

let showPopup = $state(true);
let expanded = $state(true);

let mouseX = $state(0);
let mouseY = $state(0);

let elType = $state("");
let hoveredClass = $state("");
let position = $state("");
let tagId = $state("");

let frame = $state<HTMLElement | null>(null);
let content = $state<HTMLElement | null>(null);
let bounds = $state<HTMLElement | null>(null);

let frameRect = $state<DOMRect | null>(null);
let contentRect = $state<DOMRect | null>(null);
let boundsRect = $state<DOMRect | null>(null);
let elementRect = $state<DOMRect | null>(null);

let winid = $state("");
let parentId = $state("");
let zIndex = $state(0);

let winWidth = $state(0);
let winHeight = $state(0);
let winLeft = $state(0);
let winTop = $state(0);

let isInsideFrame = $state(false);
let isInsideContent = $state(false);
let isShiftDown = $state(false);

let parentWidth = $state(0);
let parentHeight = $state(0);

let frameWidth = $state(0);
let frameHeight = $state(0);

let boundsLeft = $state(0);
let boundsTop = $state(0);

let localLeft = $state(0);
let localTop = $state(0);

let deltaWidth = $state(0);
let deltaHeight = $state(0);

let transform = $state("");
let overflow = $state("");
let display = $state("");

let scrollLeft = $state(0);
let scrollTop = $state(0);

let clientLeft = $state(0);
let clientTop = $state(0);

let offsetWidth = $state(0);
let offsetHeight = $state(0);

let scaleX = $state(1);
let scaleY = $state(1);

let dropTarget = $state("");
let dropTargetRect = $state<DOMRect | null>(null);

let calculatedLeft = $state(0);
let calculatedTop = $state(0);
let calculatedWidth = $state(0);
let calculatedHeight = $state(0);
let calculatedScale = $state(1);

let logs = $state<string[]>([]);

function addLog(message: string) {
	logs = [
		`${new Date().toLocaleTimeString()} ${message}`,
		...logs,
	].slice(0, 12);
}

function round(value: number, decimals = 2) {
	return Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0;
}

function getRect(el: HTMLElement | null) {
	return el?.getBoundingClientRect() ?? null;
}

function inspect(target: HTMLElement) {
	elType = target.tagName;
	hoveredClass = target.className?.toString() ?? "";
	tagId = target.id ?? "";
	position = getComputedStyle(target).position;
	elementRect = getRect(target);

	frame = target.closest(".window-frame") as HTMLElement | null;
	content = target.closest(".content") as HTMLElement | null;

	isInsideFrame = !!frame;
	isInsideContent = !!content;

	document.querySelectorAll(
		".window-frame, .content",
	).forEach((el) => {
		el.classList.remove(
			"debug-highlight-frame",
			"debug-highlight-content",
			"debug-highlight-bounds",
		);
	});

	frame?.classList.add("debug-highlight-frame");
	content?.classList.add("debug-highlight-content");

	winid = frame?.getAttribute("data-window-id") ?? "";

	const win = winid ? wManager.find(winid) : null;

	if (!win || !frame) {
		resetWindowData();
		return;
	}

	parentId = win.parentId ?? "root";
	zIndex = win.zIndex;

	winWidth = win.state.width;
	winHeight = win.state.height;
	winLeft = win.state.left;
	winTop = win.state.top;

	frameRect = getRect(frame);

	frameWidth = frameRect?.width ?? 0;
	frameHeight = frameRect?.height ?? 0;

	deltaWidth = frameWidth - winWidth;
	deltaHeight = frameHeight - winHeight;

	bounds = win.boundingEl;
	boundsRect = getRect(bounds);

	boundsLeft = boundsRect?.left ?? 0;
	boundsTop = boundsRect?.top ?? 0;

	parentWidth = bounds?.clientWidth ?? 0;
	parentHeight = bounds?.clientHeight ?? 0;

	scrollLeft = bounds?.scrollLeft ?? 0;
	scrollTop = bounds?.scrollTop ?? 0;

	clientLeft = bounds?.clientLeft ?? 0;
	clientTop = bounds?.clientTop ?? 0;

	offsetWidth = bounds?.offsetWidth ?? 0;
	offsetHeight = bounds?.offsetHeight ?? 0;

	bounds?.classList.add("debug-highlight-bounds");

	if (frameRect && boundsRect && bounds) {
		localLeft = frameRect.left -
			boundsRect.left -
			bounds.clientLeft +
			bounds.scrollLeft;

		localTop = frameRect.top -
			boundsRect.top -
			bounds.clientTop +
			bounds.scrollTop;
	}

	contentRect = getRect(
		frame.querySelector(".content") as HTMLElement | null,
	);

	const style = getComputedStyle(frame);

	transform = style.transform;
	overflow = style.overflow;
	display = style.display;

	if (frame.offsetWidth && frame.offsetHeight) {
		scaleX = frameRect ? frameRect.width / frame.offsetWidth : 1;

		scaleY = frameRect ? frameRect.height / frame.offsetHeight : 1;
	}

	calculateReparent();
}

function calculateReparent() {
	if (!bounds || !frameRect) return;

	const rect = bounds.getBoundingClientRect();

	const left = frameRect.left -
		rect.left -
		bounds.clientLeft +
		bounds.scrollLeft;

	const top = frameRect.top -
		rect.top -
		bounds.clientTop +
		bounds.scrollTop;

	const width = frameRect.width;
	const height = frameRect.height;

	const availableWidth = Math.max(
		1,
		bounds.clientWidth - left,
	);

	const availableHeight = Math.max(
		1,
		bounds.clientHeight - top,
	);

	const scale = Math.min(
		1,
		availableWidth / width,
		availableHeight / height,
	);

	calculatedLeft = round(left);
	calculatedTop = round(top);
	calculatedWidth = round(width * scale);
	calculatedHeight = round(height * scale);
	calculatedScale = round(scale, 4);
}

function resetWindowData() {
	winid = "";
	parentId = "";
	zIndex = 0;

	winWidth = 0;
	winHeight = 0;
	winLeft = 0;
	winTop = 0;

	frameRect = null;
	contentRect = null;
	boundsRect = null;
	bounds = null;
}

function inspectDropTarget(x: number, y: number) {
	dropTarget = "";
	dropTargetRect = null;

	const elements = document.elementsFromPoint(x, y);

	for (const element of elements) {
		const candidate = element.closest(
			".window-frame",
		) as HTMLElement | null;

		if (!candidate) continue;

		const id = candidate.getAttribute("data-window-id");

		if (!id || id === winid) continue;

		const win = wManager.find(id);
		if (!win) continue;

		dropTarget = id;
		dropTargetRect = candidate.getBoundingClientRect();

		return;
	}
}

function onMouseMove(event: MouseEvent) {
	mouseX = event.clientX;
	mouseY = event.clientY;
	isShiftDown = event.shiftKey;

	inspectDropTarget(mouseX, mouseY);
}

function onMouseOver(event: MouseEvent) {
	const target = event.target as HTMLElement;

	if (!target || target.closest(".window-inspector")) return;

	inspect(target);
}

function logCurrent() {
	addLog(
		`WIN ${winid} parent=${parentId} ` +
			`local=${round(localLeft)},${round(localTop)} ` +
			`size=${winWidth}x${winHeight}`,
	);

	addLog(
		`DROP ${dropTarget || "none"} ` +
			`mouse=${mouseX},${mouseY}`,
	);

	addLog(
		`CALC ${calculatedLeft},${calculatedTop} ` +
			`${calculatedWidth}x${calculatedHeight} ` +
			`scale=${calculatedScale}`,
	);
}

function clearLogs() {
	logs = [];
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
	style:left="{Math.min(mouseX + 15, window.innerWidth - 350)}px"
	style:top="{Math.min(mouseY + 15, window.innerHeight - 500)}px"
>
        <div class="header">
            <div>
                <strong>🔍 WINDOW INSPECTOR</strong>
                <span class="subtitle">Runtime geometry debugger</span>
            </div>

            <div class="header-actions">
                <button onclick={() => expanded = !expanded}>
                    {expanded ? "−" : "+"}
                </button>
                <button onclick={togglePopup}>×</button>
            </div>
        </div>

        {#if expanded}
            <div class="body">

                <section>
                    <h4>🖱 Mouse</h4>
                    <div class="grid">
                        <span>Client XY</span>
                        <b>{mouseX}, {mouseY}</b>

                        <span>Shift</span>
                        <b class:active={isShiftDown}>
                            {isShiftDown ? "PRESSED" : "false"}
                        </b>

                        <span>Element</span>
                        <b>{elType}</b>

                        <span>Class</span>
                        <b class="wrap">{hoveredClass}</b>

                        <span>Position</span>
                        <b>{position}</b>

                        <span>Element ID</span>
                        <b>{tagId}</b>
                    </div>
                </section>

                {#if winid}
                    <section>
                        <h4>🪟 Window state</h4>
                        <div class="grid">
                            <span>winId</span>
                            <b class="blue wrap">{winid}</b>

                            <span>parentId</span>
                            <b class="yellow">{parentId}</b>

                            <span>z-index</span>
                            <b>{zIndex}</b>

                            <span>State left/top</span>
                            <b>{winLeft} / {winTop}</b>

                            <span>State width/height</span>
                            <b>{winWidth} × {winHeight}</b>
                        </div>
                    </section>

                    <section>
                        <h4>📐 Frame DOM</h4>
                        <div class="grid">
                            <span>Screen left/top</span>
                            <b>
                                {round(frameRect?.left ?? 0)} /
                                {round(frameRect?.top ?? 0)}
                            </b>

                            <span>DOM width/height</span>
                            <b>{round(frameWidth)} × {round(frameHeight)}</b>

                            <span>State - DOM</span>
                            <b class:warning={
                                Math.abs(deltaWidth) > 1 ||
                                Math.abs(deltaHeight) > 1
                            }>
                                {round(deltaWidth)} × {round(deltaHeight)}
                            </b>

                            <span>Scale X/Y</span>
                            <b>{round(scaleX, 4)} / {round(scaleY, 4)}</b>
                        </div>
                    </section>

                    <section>
                        <h4>📦 Parent bounds</h4>
                        <div class="grid">
                            <span>Element</span>
                            <b>{bounds?.tagName ?? "missing"}</b>

                            <span>Screen left/top</span>
                            <b>{round(boundsLeft)} / {round(boundsTop)}</b>

                            <span>Client width/height</span>
                            <b>{parentWidth} × {parentHeight}</b>

                            <span>Offset width/height</span>
                            <b>{offsetWidth} × {offsetHeight}</b>

                            <span>Client border L/T</span>
                            <b>{clientLeft} / {clientTop}</b>

                            <span>Scroll L/T</span>
                            <b>{scrollLeft} / {scrollTop}</b>
                        </div>
                    </section>

                    <section>
                        <h4>🎯 Local coordinates</h4>
                        <div class="grid">
                            <span>Calculated left/top</span>
                            <b class="green">
                                {round(localLeft)} / {round(localTop)}
                            </b>

                            <span>State left/top</span>
                            <b>{winLeft} / {winTop}</b>

                            <span>Difference</span>
                            <b class:warning={
                                Math.abs(localLeft - winLeft) > 1 ||
                                Math.abs(localTop - winTop) > 1
                            }>
                                {round(localLeft - winLeft)} /
                                {round(localTop - winTop)}
                            </b>
                        </div>
                    </section>

                    <section>
                        <h4>🧮 Reparent simulation</h4>
                        <div class="grid">
                            <span>Local left/top</span>
                            <b>{calculatedLeft} / {calculatedTop}</b>

                            <span>New width/height</span>
                            <b class="green">
                                {calculatedWidth} × {calculatedHeight}
                            </b>

                            <span>Scale factor</span>
                            <b>{calculatedScale}</b>
                        </div>
                    </section>

                    <section>
                        <h4>🎯 Drop target</h4>
                        <div class="grid">
                            <span>Target ID</span>
                            <b class="yellow">{dropTarget || "none"}</b>

                            <span>Target screen XY</span>
                            <b>
                                {round(dropTargetRect?.left ?? 0)} /
                                {round(dropTargetRect?.top ?? 0)}
                            </b>

                            <span>Target size</span>
                            <b>
                                {round(dropTargetRect?.width ?? 0)} ×
                                {round(dropTargetRect?.height ?? 0)}
                            </b>
                        </div>
                    </section>

                    <section>
                        <h4>🎨 CSS</h4>
                        <div class="grid">
                            <span>Display</span>
                            <b>{display}</b>

                            <span>Overflow</span>
                            <b>{overflow}</b>

                            <span>Transform</span>
                            <b class="wrap">{transform}</b>
                        </div>
                    </section>
                {/if}

                <section>
                    <h4>📋 Debug log</h4>

                    <div class="log-actions">
                        <button onclick={logCurrent}>Capture</button>
                        <button onclick={clearLogs}>Clear</button>
                    </div>

                    {#each logs as log}
                        <div class="log">{log}</div>
                    {/each}
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
	box-shadow: 0 8px 30px rgba(0,0,0,.5);
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
	grid-template-columns: 115px minmax(0, 1fr);
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

.green {
	color: #34d399 !important;
}

.warning {
	color: #fb7185 !important;
}

.active {
	color: #34d399 !important;
}

.log-actions {
	display: flex;
	gap: 5px;
	margin-bottom: 5px;
}

.log {
	padding: 3px;
	color: #cbd5e1;
	border-bottom: 1px solid #334155;
	overflow-wrap: anywhere;
}
</style>
