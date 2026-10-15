<script lang="ts">
import { onDestroy, onMount, type Snippet } from "svelte";
import WindowFrame from "./WindowFrame.svelte";
// Längst upp bland dina övriga importer:
import { cubicInOut } from "svelte/easing";
import { fly } from "svelte/transition";

import {
  getWindowManager,
  MIN_HEIGHT,
  MIN_WIDTH,
  type ResizeMode,
  ROOT_WIN_ID,
  type WindowInstance,
  type WindowRect,
} from "./windowManager.svelte";

type InteractionMode = "move" | ResizeMode;

interface Props {
  win: WindowInstance;
  bounds: HTMLElement;
  children: Snippet;
}

let { win, bounds, children }: Props = $props();

const manager = getWindowManager();

let frameEl: HTMLDivElement;
// let contentEl: HTMLDivElement;
let contentEl = $state<HTMLElement | undefined>(undefined);

let left = $derived(win.state.left);
let top = $derived(win.state.top);
let width = $derived(win.state.width);
let height = $derived(win.state.height);
let transparency = $derived(win.state.transparency);
let titleId = $derived(`win-title-${win.winId}`);

let titlebarVisible = $state(true);
let hideTitlebarTimeout: ReturnType<typeof setTimeout> | undefined;

let dragMode: InteractionMode | null = null;
let dragWinId: string | null = null;
let dragStartX = 0;
let dragStartY = 0;
let startLeft = 0;
let startTop = 0;
let startWidth = 0;
let startHeight = 0;

let snappedLeft: number | null = null;
let snappedTop: number | null = null;

const SNAP_DISTANCE = 12;
const RELEASE_DISTANCE = 24;
const HIDE_DELAY = 700;

const resizeHandles: ResizeMode[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "top",
  "right",
  "bottom",
  "left",
];

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
  // Rooten har ingen WindowFrame. Alla andra fönster
  // mäts i sin förälders innehållsyta.
  const rect = frameEl.getBoundingClientRect();

  if (win.state.width <= 0 || win.state.height <= 0) {
    manager.update(win.winId, {
      width: win.state.width || rect.width,
      height: win.state.height || rect.height + win.extraHeight,
    });
  }
});

onDestroy(() => {
  clearTitlebarTimeout();
  cleanupInteraction();
});

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

  // Bara fönster i samma koordinatsystem deltar i dockningen.
  for (
    const other of manager.getChildren(
      win.parentId ?? ROOT_WIN_ID,
    )
  ) {
    if (other.winId === win.winId || other.state.isMinimized) {
      continue;
    }

    addRectTargets({
      left: other.state.left,
      top: other.state.top,
      width: other.state.width,
      height: other.state.height,
    });
  }

  return targets;
}

function snapPosition(
  raw: number,
  targets: number[],
  previous: number | null,
): number {
  if (
    previous !== null &&
    Math.abs(raw - previous) <= SNAP_DISTANCE + RELEASE_DISTANCE
  ) {
    return previous;
  }

  const nearest = targets
    .map((target) => ({
      target,
      distance: Math.abs(raw - target),
    }))
    .filter((item) => item.distance <= SNAP_DISTANCE)
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest?.target ?? raw;
}

function beginInteraction(
  event: MouseEvent,
  mode: InteractionMode,
) {
  if (event.button !== 0) return;
  if (win.winId === ROOT_WIN_ID) return;

  const target = event.target;
  if (
    target instanceof Element &&
    target.closest("button, input, select, textarea, a")
  ) {
    return;
  }

  if (win.state.isMaximized && mode === "move") return;

  event.preventDefault();
  event.stopPropagation();

  let activeWin = win;

  // Ctrl + drag i titelraden skapar en kopia.
  // Endast flyttning duplicerar; storleksändring gör det inte.
  if (event.ctrlKey && mode === "move") {
    const copy = manager.duplicate(win.winId);
    if (!copy) return;

    activeWin = copy;
  }

  manager.focus(activeWin.winId);

  dragWinId = activeWin.winId;
  dragMode = mode;

  dragStartX = event.clientX;
  dragStartY = event.clientY;

  startLeft = activeWin.state.left;
  startTop = activeWin.state.top;
  startWidth = activeWin.state.width;
  startHeight = activeWin.state.height;

  document.body.style.userSelect = "none";

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", endInteraction);
}

function onMouseMove(event: MouseEvent) {
  if (!dragMode || !dragWinId) return;

  const activeWin = manager.find(dragWinId);
  if (!activeWin) return;

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

    // Använd den aktiva instansens position och storlek.
    const snapX = (targets: number[], raw: number, previous: number | null) =>
      snapPosition(raw, targets, previous);

    const xTargets = [
      0,
      boundsWidth - startWidth,
      ...manager
        .getChildren(activeWin.parentId ?? ROOT_WIN_ID)
        .filter(
          (other) =>
            other.winId !== activeWin.winId &&
            !other.state.isMinimized,
        )
        .flatMap((other) => [
          other.state.left,
          other.state.left + other.state.width,
          other.state.left - startWidth,
          other.state.left + other.state.width - startWidth,
        ]),
    ];

    const yTargets = [
      0,
      boundsHeight - startHeight,
      ...manager
        .getChildren(activeWin.parentId ?? ROOT_WIN_ID)
        .filter(
          (other) =>
            other.winId !== activeWin.winId &&
            !other.state.isMinimized,
        )
        .flatMap((other) => [
          other.state.top,
          other.state.top + other.state.height,
          other.state.top - startHeight,
          other.state.top + other.state.height - startHeight,
        ]),
    ];

    nextLeft = snapX(xTargets, rawLeft, snappedLeft);
    nextTop = snapX(yTargets, rawTop, snappedTop);

    snappedLeft = nextLeft !== rawLeft ? nextLeft : null;
    snappedTop = nextTop !== rawTop ? nextTop : null;
  } else {
    if (dragMode.includes("right")) nextWidth = startWidth + dx;
    if (dragMode.includes("left")) {
      nextWidth = startWidth - dx;
      nextLeft = startLeft + dx;
    }

    if (dragMode.includes("bottom")) nextHeight = startHeight + dy;
    if (dragMode.includes("top")) {
      nextHeight = startHeight - dy;
      nextTop = startTop + dy;
    }

    nextWidth = clamp(nextWidth, MIN_WIDTH, boundsWidth);
    nextHeight = clamp(nextHeight, MIN_HEIGHT, boundsHeight);

    if (dragMode.includes("left")) {
      nextLeft = startLeft + startWidth - nextWidth;
    }

    if (dragMode.includes("top")) {
      nextTop = startTop + startHeight - nextHeight;
    }
  }

  nextWidth = Math.min(nextWidth, boundsWidth);
  nextHeight = Math.min(nextHeight, boundsHeight);
  nextLeft = clamp(nextLeft, 0, boundsWidth - nextWidth);
  nextTop = clamp(nextTop, 0, boundsHeight - nextHeight);

  const nextRect: WindowRect = {
    left: nextLeft,
    top: nextTop,
    width: nextWidth,
    height: nextHeight,
  };

  if (dragMode === "move") {
    manager.update(activeWin.winId, nextRect);
  } else {
    manager.resizeDockedWindow(activeWin.winId, dragMode, nextRect);
  }
}

function cleanupInteraction() {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", endInteraction);
  document.body.style.userSelect = "";
}

function endInteraction() {
  dragMode = null;
  dragWinId = null;
  snappedLeft = null;
  snappedTop = null;
  cleanupInteraction();
}

function interaction(node: HTMLElement, mode: InteractionMode) {
  const handleMouseDown = (event: MouseEvent) => {
    beginInteraction(event, mode);
  };

  node.addEventListener("mousedown", handleMouseDown);

  return {
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
</script>

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


  {#if win.state.isMaximized && !titlebarVisible}
  <div 
    class="titlebar-hover-trigger" 
    onmouseenter={showTitlebar}
    role="presentation"
  ></div>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="titlebar"
    class:is-hidden={win.state.isMaximized && !titlebarVisible}
    
    use:interaction={"move"}
    onmouseenter={showTitlebar}
    onmouseleave={scheduleHideTitlebar}
    ondblclick={toggleMaximize}
  >
    <strong id={titleId}>{win.title}</strong>

    {#if win.showButtons}
      {#if win.actions}
        {@const Actions = win.actions}
        <Actions winId={win.winId} />
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
    {/if}
  </div>

  <div class="content" bind:this={contentEl}>
    {@render children()}

    {#each manager.getChildren(win.winId) as child (child.winId)}
      {#if !child.state.isMinimized && child.component}
      
      <div 
      transition:fly={{ y: 50, duration: 250, easing: cubicInOut }} 
      style:display="contents"
    >
      
      <WindowFrame win={child} bounds={contentEl}>
        {@const ChildComponent = child.component}
          <ChildComponent
            winId={child.winId}
            {...child.props}
            parentId={child.parentId}
          />
        
       </WindowFrame> 
      </div>
      {/if}
    {/each}
  </div>

  {#each resizeHandles as handle (handle)}
    <div
      class="resize-handle {handle}"
      use:interaction={handle}
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

/* 🟢 NY STIL FÖR ATT FÅNGA HOVER VID SKÄRMKANTEN */
.titlebar-hover-trigger {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px; /* Tjockleken på ytan som reagerar längst upp */
  z-index: 9999; /* Måste ligga absolut högst upp för att inte täckas av innehållet */
  background: transparent;
  pointer-events: auto;
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
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  isolation: isolate;
}

.window-frame.is-maximized .titlebar {
  position: absolute;
  z-index: 5;
  top: 0;
  left: 0;
  right: 0;
  box-sizing: border-box;
  transition: transform 180ms ease, opacity 180ms ease;
}

.window-frame.is-maximized .titlebar.is-hidden {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
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
