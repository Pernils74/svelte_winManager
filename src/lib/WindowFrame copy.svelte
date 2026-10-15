<!-- WindowFRame.svelte -->


<script lang="ts">
import { onDestroy, onMount, type Snippet } from "svelte";
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  type ResizeMode,
  type WindowInstance,
  type WindowRect,
} from "./windowManager.svelte";
import { getWindowManager } from "./windowManager.svelte";

type InteractionMode = "move" | ResizeMode;

interface InteractionOptions {
  mode: InteractionMode;
}

let {
  win,
  bounds,
  children,
}: {
  win: WindowInstance;
  bounds: HTMLElement;
  children: Snippet;
} = $props();

const manager = getWindowManager();
const titleId = $derived(`win-title-${win.winId}`);

let frameEl: HTMLDivElement;
let titlebarEl: HTMLDivElement;

let left = $derived(win.state.left);
let top = $derived(win.state.top);
let width = $derived(win.state.width);
let height = $derived(win.state.height);
let transparency = $derived(win.state.transparency);

let minWidth = $state(MIN_WIDTH);
let minHeight = $state(MIN_HEIGHT);

let titlebarVisible = $state(true);
let hideTitlebarTimeout: ReturnType<typeof setTimeout> | undefined;

let dragStartX = 0;
let dragStartY = 0;
let startLeft = 0;
let startTop = 0;
let startWidth = 0;
let startHeight = 0;

let dragMode: InteractionMode | null = null;

const SNAP_DISTANCE = 12;
const RELEASE_DISTANCE = 24;
const HIDE_DELAY = 700;

let snappedLeft = $state<number | null>(null);
let snappedTop = $state<number | null>(null);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clearTitlebarTimeout() {
  if (hideTitlebarTimeout !== undefined) {
    clearTimeout(hideTitlebarTimeout);
    hideTitlebarTimeout = undefined;
  }
}

function showTitlebar() {
  clearTitlebarTimeout();
  titlebarVisible = true;
}

function scheduleHideTitlebar() {
  if (!win.state.isMaximized) return;

  clearTitlebarTimeout();

  hideTitlebarTimeout = setTimeout(() => {
    titlebarVisible = false;
    hideTitlebarTimeout = undefined;
  }, HIDE_DELAY);
}

$effect(() => {
  if (win.state.isMaximized) {
    scheduleHideTitlebar();
  } else {
    clearTitlebarTimeout();
    titlebarVisible = true;
  }
});

onMount(() => {
  const rect = frameEl.getBoundingClientRect();

  const initialWidth = win.state.width || rect.width;
  const initialHeight = win.state.height || rect.height + win.extraHeight;

  manager.update(win.winId, {
    width: initialWidth,
    height: initialHeight,
  });
});

onDestroy(() => {
  clearTitlebarTimeout();
  cleanupInteraction();
});

/**
 * Returnerar snappositioner relativt arbetsytans övre vänstra hörn.
 * Fönster och boundingEl antas ligga i samma koordinatsystem som
 * WindowFrame, det vill säga arbetsytan.
 */
function getSnapTargets(axis: "x" | "y"): number[] {
  const targets: number[] = [];

  const currentWidth = win.state.width;
  const currentHeight = win.state.height;

  if (axis === "x") {
    targets.push(0, bounds.clientWidth - currentWidth);
  } else {
    targets.push(0, bounds.clientHeight - currentHeight);
  }

  const addRectTargets = (rect: WindowRect) => {
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;

    if (axis === "x") {
      targets.push(
        rect.left,
        right,
        right - currentWidth,
        rect.left - currentWidth,
      );
    } else {
      targets.push(
        rect.top,
        bottom,
        bottom - currentHeight,
        rect.top - currentHeight,
      );
    }
  };

  // Övriga fönster, inklusive syskon och föräldrafönster.
  for (const other of manager.windows) {
    if (
      other.winId === win.winId ||
      other.state.isMinimized
    ) {
      continue;
    }

    addRectTargets({
      left: other.state.left,
      top: other.state.top,
      width: other.state.width,
      height: other.state.height,
    });
  }

  // Explicit DOM-begränsning, exempelvis ett föräldraelement.
  if (win.boundingEl && win.boundingEl !== bounds) {
    const boundsRect = bounds.getBoundingClientRect();
    const parentRect = win.boundingEl.getBoundingClientRect();

    addRectTargets({
      left: parentRect.left - boundsRect.left,
      top: parentRect.top - boundsRect.top,
      width: parentRect.width,
      height: parentRect.height,
    });
  }

  return targets;
}

function snapPosition(
  rawPosition: number,
  targets: number[],
  previousSnap: number | null,
): number {
  if (
    previousSnap !== null &&
    Math.abs(rawPosition - previousSnap) <=
      SNAP_DISTANCE + RELEASE_DISTANCE
  ) {
    return previousSnap;
  }

  const nearest = targets
    .map((target) => ({
      target,
      distance: Math.abs(rawPosition - target),
    }))
    .filter((item) => item.distance <= SNAP_DISTANCE)
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest?.target ?? rawPosition;
}

function beginInteraction(
  event: MouseEvent,
  mode: InteractionMode,
) {
  if (event.button !== 0) return;

  if (
    (event.target as HTMLElement).closest(
      "button, input, select, textarea, a",
    )
  ) {
    return;
  }

  // Ett maximerat fönster ska inte flyttas eller storleksändras.
  if (win.state.isMaximized && mode === "move") return;

  event.preventDefault();
  event.stopPropagation();

  manager.focus(win.winId);

  dragMode = mode;

  dragStartX = event.clientX;
  dragStartY = event.clientY;

  startLeft = win.state.left;
  startTop = win.state.top;
  startWidth = win.state.width;
  startHeight = win.state.height;

  document.body.style.userSelect = "none";

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", endInteraction);
}

function onMouseMove(event: MouseEvent) {
  if (!dragMode) return;

  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;

  const boundsWidth = bounds.clientWidth;
  const boundsHeight = bounds.clientHeight;

  let nextLeft = startLeft;
  let nextTop = startTop;
  let nextWidth = startWidth;
  let nextHeight = startHeight;

  if (dragMode === "move") {
    const rawLeft = startLeft + dx;
    const rawTop = startTop + dy;

    nextLeft = snapPosition(
      rawLeft,
      getSnapTargets("x"),
      snappedLeft,
    );

    nextTop = snapPosition(
      rawTop,
      getSnapTargets("y"),
      snappedTop,
    );

    snappedLeft = nextLeft !== rawLeft ? nextLeft : null;
    snappedTop = nextTop !== rawTop ? nextTop : null;
  } else {
    if (dragMode.includes("right")) {
      nextWidth = startWidth + dx;
    }

    if (dragMode.includes("left")) {
      nextWidth = startWidth - dx;
      nextLeft = startLeft + dx;
    }

    if (dragMode.includes("bottom")) {
      nextHeight = startHeight + dy;
    }

    if (dragMode.includes("top")) {
      nextHeight = startHeight - dy;
      nextTop = startTop + dy;
    }

    nextWidth = clamp(nextWidth, minWidth, boundsWidth);
    nextHeight = clamp(nextHeight, minHeight, boundsHeight);

    if (dragMode.includes("left")) {
      nextLeft = startLeft + startWidth - nextWidth;
    }

    if (dragMode.includes("top")) {
      nextTop = startTop + startHeight - nextHeight;
    }
  }

  nextLeft = clamp(nextLeft, 0, boundsWidth - nextWidth);
  nextTop = clamp(nextTop, 0, boundsHeight - nextHeight);

  const nextRect: WindowRect = {
    left: nextLeft,
    top: nextTop,
    width: nextWidth,
    height: nextHeight,
  };

  if (dragMode === "move") {
    manager.update(win.winId, nextRect);
  } else {
    manager.resizeDockedWindow(win.winId, dragMode, nextRect);
  }
}

function cleanupInteraction() {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", endInteraction);

  document.body.style.userSelect = "";
}

function endInteraction() {
  dragMode = null;
  snappedLeft = null;
  snappedTop = null;

  cleanupInteraction();
}

/**
 * Svelte action: use:interaction.
 * Varje handtag deklarerar endast vilket läge det använder.
 */
function interaction(node: HTMLElement, options: InteractionOptions) {
  const handleMouseDown = (event: MouseEvent) => {
    beginInteraction(event, options.mode);
  };

  node.addEventListener("mousedown", handleMouseDown);

  return {
    update(nextOptions: InteractionOptions) {
      options = nextOptions;
    },

    destroy() {
      node.removeEventListener("mousedown", handleMouseDown);
    },
  };
}

function toggleMaximize() {
  endInteraction();
  manager.toggleMaximize(win.winId, bounds);
}

function changeTransparency(event: WheelEvent) {
  if (!event.shiftKey) return;

  event.preventDefault();
  event.stopPropagation();

  const delta = event.deltaY < 0 ? 0.05 : -0.05;

  manager.update(win.winId, {
    transparency: clamp(
      Number((win.state.transparency + delta).toFixed(2)),
      0.2,
      1,
    ),
  });
}

function minimize() {
  endInteraction();
  manager.minimize(win.winId);
}

function close() {
  endInteraction();
  manager.closeWin(win.winId);
}

const resizeHandles: {
  name: ResizeMode;
  mode: ResizeMode;
}[] = [
  { name: "top-left", mode: "top-left" },
  { name: "top-right", mode: "top-right" },
  { name: "bottom-left", mode: "bottom-left" },
  { name: "bottom-right", mode: "bottom-right" },
  { name: "top", mode: "top" },
  { name: "right", mode: "right" },
  { name: "bottom", mode: "bottom" },
  { name: "left", mode: "left" },
];
</script>

{#if win.state.isMaximized}
  <div
  class="titlebar-reveal-zone"
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  onmouseenter={showTitlebar}
  onmouseleave={scheduleHideTitlebar}
  aria-hidden="true"
></div>
{/if}

<div
  bind:this={frameEl}
  class="window-frame"
  class:is-maximized={win.state.isMaximized}
  style:left="{left}px"
  style:top="{top}px"
  style:width="{width}px"
  style:height="{height}px"
  style:z-index={win.zIndex}
  style:opacity={transparency}
  onmousedown={() => manager.focus(win.winId)}
  onwheel={changeTransparency}
  role="dialog"
  tabindex="0"
  aria-labelledby={titleId}
  aria-modal="false"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={titlebarEl}
    class="titlebar"
    class:is-hidden={win.state.isMaximized && !titlebarVisible}
    use:interaction={{ mode: "move" }}
    onmouseenter={showTitlebar}
    onmouseleave={scheduleHideTitlebar}
    ondblclick={toggleMaximize}
  >
    <strong id={titleId}>{win.title}</strong>

    {#if win.showButtons}
      {@const Actions = win.actions}
      {#if Actions}
        <Actions winId={win.winId} />
      {/if}
    {/if}

    <div class="controls">
      <button
        type="button"
        title="Maximera/återställ"
        aria-label="Maximera eller återställ fönster"
        onclick={toggleMaximize}
      >🗖</button>

      <button
        type="button"
        title="Minimera"
        aria-label="Minimera fönster"
        onclick={minimize}
      >🗕</button>

      <button
        type="button"
        title="Stäng"
        aria-label="Stäng fönster"
        onclick={close}
      >❌</button>
    </div>
  </div>

  <div class="content">
    {@render children()}
  </div>

  {#each resizeHandles as handle (handle.name)}
    <div
      class="resize-handle {handle.name}"
      use:interaction={{ mode: handle.mode }}
      role="presentation"
      aria-hidden="true"
    ></div>
  {/each}
</div>

<style>
.window-frame {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: white;
  border-radius: 6px;
  box-shadow: 2px 4px 14px rgb(0 0 0 / 15%);
  overflow: hidden;
}

.titlebar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
  background: linear-gradient(180deg, #e8f0ff, #b3d9ff);
  border-bottom: 1px solid #140202;
  cursor: grab;
  user-select: none;
}

.titlebar:active {
  cursor: grabbing;
}

.titlebar strong {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.controls {
  display: flex;
  flex: 0 0 auto;
  gap: 0.25rem;
  margin-left: auto;
}

.controls button {
  padding: 4px 8px;
  color: white;
  background: #007acc;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.controls button:hover {
  background: #005fa3;
}

.content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

/* Titelraden ligger ovanpå innehållet vid maximering. */
.window-frame.is-maximized .titlebar {
  position: absolute;
  z-index: 5;
  top: 0;
  left: 0;
  right: 0;
  box-sizing: border-box;
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.window-frame.is-maximized .titlebar.is-hidden {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

.titlebar-reveal-zone {
  position: absolute;
  z-index: 100000;
  height: 6px;
  pointer-events: auto;
}

.resize-handle {
  position: absolute;
  z-index: 2;
  width: 10px;
  height: 10px;
  background: transparent;
}

.resize-handle:hover {
  background: #8f9dfb68;
}

.top-left {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.top-right {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.bottom-left {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

.bottom-right {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}

.top {
  top: 0;
  left: 10%;
  width: 80%;
  height: 4px;
  cursor: ns-resize;
}

.bottom {
  bottom: 0;
  left: 10%;
  width: 80%;
  height: 4px;
  cursor: ns-resize;
}

.left {
  left: 0;
  top: 10%;
  height: 80%;
  width: 4px;
  cursor: ew-resize;
}

.right {
  right: 0;
  top: 10%;
  height: 80%;
  width: 4px;
  cursor: ew-resize;
}
</style>
