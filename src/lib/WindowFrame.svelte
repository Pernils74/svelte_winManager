<!-- Obs: I den här filen ska raden <slot-fallback /> inte användas som en faktisk Svelte-komponent. Om du vill ha en plats för knappar i topbaren använder vi i stället en separat snippet, vilket är Svelte 5:s rekommenderade sätt att skicka in innehåll.

Här är den konkreta ändringen: ersätt <slot-fallback /> med följande:
svelte

{#if children}
  {@render children()}
{/if}

Ta då bort den andra förekomsten av {@render children()} i arbetsytan om du vill använda samma snippet enbart i topbaren. Vill du ha innehåll på båda platserna ska vi använda två separata snippets, exempelvis toolbar och children.
4. src/lib/WindowFrame.svelte

Det här är den nya motsvarigheten till din DraggableResizable.svelte. Den hanterar geometri och fönsterkontroller, men inte hur innehållskomponenten ser ut.

Jag har behållit grundfunktionerna och förenklat tillståndshanteringen. Storleksändring görs med musen, fönstret hålls inom arbetsytan och dubbelklick på titelraden maximerar fönstret.
svelte -->

<script lang="ts">
import { onMount, type Snippet } from "svelte";
import type { WindowInstance } from "./windowManager.svelte";
import { getWindowManager } from "./windowManager.svelte";
import ArenaMonitorButtons from "./ArenaMonitorButtons.svelte";

let {
  win,
  bounds,
  children,
}: {
  win: WindowInstance;
  bounds: HTMLElement; //| undefined;
  children: Snippet;
} = $props();
const manager = getWindowManager();
const titleId = $derived(`win-title-${win.winId}`);

let titlebarVisible = $state(true);
let hideTitlebarTimeout: ReturnType<typeof setTimeout> | undefined;

const TITLEBAR_HEIGHT = 32;
const HIDE_DELAY = 700;

function showTitlebar() {
  if (hideTitlebarTimeout) {
    clearTimeout(hideTitlebarTimeout);
  }

  titlebarVisible = true;
}

function scheduleHideTitlebar() {
  if (!win.state.isMaximized) return;

  if (hideTitlebarTimeout) {
    clearTimeout(hideTitlebarTimeout);
  }

  hideTitlebarTimeout = setTimeout(() => {
    titlebarVisible = false;
    hideTitlebarTimeout = undefined;
  }, HIDE_DELAY);
}

let frameEl: HTMLDivElement;
let titlebarEl: HTMLDivElement;

let left = $derived(win.state.left);
let top = $derived(win.state.top);
let width = $derived(win.state.width);
let height = $derived(win.state.height);
let transparency = $derived(win.state.transparency);

let minWidth = $state(160);
let minHeight = $state(100);

let dragStartX = 0;
let dragStartY = 0;
let startLeft = 0;
let startTop = 0;
let startWidth = 0;
let startHeight = 0;

let dragMode: "move" | string | null = null;

const SNAP_DISTANCE = 12; // Avstånd då magneten aktiveras
const RELEASE_DISTANCE = 24; // Extra avstånd innan magneten släpper

let snappedLeft = $state<number | null>(null);
let snappedTop = $state<number | null>(null);

onMount(() => {
  if (!frameEl) {
    console.log("ghjgj");
    return;
  }

  const rect = frameEl.getBoundingClientRect();

  minWidth = Math.max(160, rect.width);
  minHeight = Math.max(100, rect.height);

  // Innehållet kan ha en initial höjd som inte är känd
  // när fönstret öppnas.
  const initialWidth = win.state.width || rect.width;
  const initialHeight = win.state.height || rect.height + win.extraHeight;

  manager.update(win.winId, {
    width: initialWidth,
    height: initialHeight,
  });
});

$effect(() => {
  if (!win.state.isMaximized) {
    titlebarVisible = true;

    if (hideTitlebarTimeout) {
      clearTimeout(hideTitlebarTimeout);
      hideTitlebarTimeout = undefined;
    }
  } else {
    scheduleHideTitlebar();
  }
});

function getSnapTargets(axis: "x" | "y"): number[] {
  const targets: number[] = [];

  const currentWidth = win.state.width;
  const currentHeight = win.state.height;

  // Arbetsytans kanter
  if (axis === "x") {
    targets.push(
      0,
      bounds.clientWidth - currentWidth,
    );
  } else {
    targets.push(
      0,
      bounds.clientHeight - currentHeight,
    );
  }

  // Andra synliga fönsters kanter
  for (const other of manager.windows) {
    if (
      other.winId === win.winId ||
      other.state.isMinimized
    ) {
      continue;
    }

    const otherLeft = other.state.left;
    const otherTop = other.state.top;
    const otherRight = otherLeft + other.state.width;
    const otherBottom = otherTop + other.state.height;

    if (axis === "x") {
      // Vänster mot vänster
      targets.push(otherLeft);

      // Vänster mot höger
      targets.push(otherRight);

      // Höger mot höger
      targets.push(otherRight - currentWidth);

      // Höger mot vänster
      targets.push(otherLeft - currentWidth);
    } else {
      // Topp mot topp
      targets.push(otherTop);

      // Topp mot botten
      targets.push(otherBottom);

      // Botten mot botten
      targets.push(otherBottom - currentHeight);

      // Botten mot topp
      targets.push(otherTop - currentHeight);
    }
  }

  return targets;
}

function snapPosition(
  rawPosition: number,
  targets: number[],
  previousSnap: number | null,
): number {
  // Behåll befintlig dockning tills användaren drar
  // tillräckligt långt bort från magneten.
  if (
    previousSnap !== null &&
    Math.abs(rawPosition - previousSnap) <=
      SNAP_DISTANCE + RELEASE_DISTANCE
  ) {
    return previousSnap;
  }

  // Den gamla magneten har släppt.
  const nearest = targets
    .map((target) => ({
      target,
      distance: Math.abs(rawPosition - target),
    }))
    .filter((item) => item.distance <= SNAP_DISTANCE)
    .sort((a, b) => a.distance - b.distance)[0];

  return nearest?.target ?? rawPosition;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function beginInteraction(
  event: MouseEvent,
  mode: "move" | string,
) {
  if (event.button !== 0) return;

  // Knappklick ska inte starta en dragning.
  if ((event.target as HTMLElement).closest("button")) return;

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

  // if (dragMode === "move") {
  //   nextLeft = startLeft + dx;
  //   nextTop = startTop + dy;

  if (dragMode === "move") {
    const rawLeft = startLeft + dx;
    const rawTop = startTop + dy;

    const targetsX = getSnapTargets("x");
    const targetsY = getSnapTargets("y");

    nextLeft = snapPosition(
      rawLeft,
      targetsX,
      snappedLeft,
    );

    nextTop = snapPosition(
      rawTop,
      targetsY,
      snappedTop,
    );
    // Kom ihåg om vi faktiskt dockade.
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

    // Håll vänster- och överkanterna på rätt plats
    // även när storleken begränsas.
    if (dragMode.includes("left")) {
      nextLeft = startLeft + startWidth - nextWidth;
    }

    if (dragMode.includes("top")) {
      nextTop = startTop + startHeight - nextHeight;
    }
  }

  nextLeft = clamp(nextLeft, 0, boundsWidth - nextWidth);
  nextTop = clamp(nextTop, 0, boundsHeight - nextHeight);

  // manager.update(win.winId, {
  //   left: nextLeft,
  //   top: nextTop,
  //   width: nextWidth,
  //   height: nextHeight,
  // });
  const nextRect = {
    left: nextLeft,
    top: nextTop,
    width: nextWidth,
    height: nextHeight,
  };

  if (dragMode === "move") {
    manager.update(win.winId, nextRect);
  } else {
    manager.resizeDockedWindow(
      win.winId,
      dragMode,
      nextRect,
    );
  }
}

function endInteraction() {
  dragMode = null;
  snappedLeft = null;
  snappedTop = null;
  document.body.style.userSelect = "";

  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", endInteraction);
}

function toggleMaximize() {
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
  manager.minimize(win.winId);
}

function close() {
  manager.closeWin(win.winId);
}
</script>

<!--
  Vi skapar ett unikt ID för varje fönstertitel
  så att aria-labelledby kan koppla ihop ramen med sin rubrik.
-->
<!-- {@const titleId = `win-title-${win.winId}`} -->

{#if win.state.isMaximized}
  <div
  class="titlebar-reveal-zone"
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
  // <!-- 1. Berättar att bakgrunden fortfarande går att klicka på -->
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
  bind:this={titlebarEl}
  class="titlebar"
  class:is-hidden={win.state.isMaximized && !titlebarVisible}
  onmouseenter={showTitlebar}
  onmouseleave={scheduleHideTitlebar}
  onmousedown={(event) => beginInteraction(event, 'move')}
  ondblclick={toggleMaximize}
>
 
 
 
 <strong id={titleId}>{win.title}</strong>

    {#if win.showButtons}
      <win.actions winId={win.winId} />
      <!-- <ArenaMonitorButtons winId={win.winId} /> -->
    {/if}

    <div class="controls">
      <!-- 2. type="button" samt aria-label översätter ikonsymbolerna för skärmläsare -->
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

  {#each [
    ['top-left', 'top-left'],
    ['top-right', 'top-right'],
    ['bottom-left', 'bottom-left'],
    ['bottom-right', 'bottom-right'],
    ['top', 'top'],
    ['right', 'right'],
    ['bottom', 'bottom'],
    ['left', 'left']
  ] as handle}
    <div
      class="resize-handle {handle[0]}"
      onmousedown={(event) => beginInteraction(event, handle[1])}
      role="presentation" 
      // <!-- 3. Detta döljer helt de osynliga kanterna från skärmläsaren -->
    ></div>
  {/each}
</div>

<svelte:window onkeydown={(event) => {
  if (event.altKey && event.key.toLowerCase() === 'x') {
    // Reserverad genväg för framtida inspector.
  }
}} />

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
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Osynlig zon som aktiverar titelraden vid skärmens överkant */
.titlebar-reveal-zone {
  position: absolute;
  z-index: 100000;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  pointer-events: auto;
}

/* Titelraden glider upp och försvinner */
.window-frame.is-maximized .titlebar {
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}

.window-frame.is-maximized .titlebar.is-hidden {
  transform: translateY(-100%);
  opacity: 0;
  pointer-events: none;
}

/* Gör plats för innehållet när titelraden är dold */
.window-frame.is-maximized .content {
  flex: 1 1 auto;
  min-height: 0;
}

.controls {
  display: flex;
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
