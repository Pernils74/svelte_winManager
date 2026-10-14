import { createContext, type Component } from "svelte";

export const EPSILON = 3;
export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 100;

const MAXIMIZE_EPSILON = 5;

export type WindowId = string;

export type DockSide = "left" | "right" | "top" | "bottom";

export type WindowActionsComponent = Component<{ winId: string }>;

export interface WindowDocking {
  left?: WindowId;
  right?: WindowId;
  top?: WindowId;
  bottom?: WindowId;
}

export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WindowState extends WindowRect {
  isMinimized: boolean;
  isMaximized: boolean;
  transparency: number;
}

export interface WindowInstance<TPayload = unknown> {
  winId: WindowId;
  title: string;
  component: Component<any>;
  props: Record<string, unknown>;

  parentId: WindowId | null;
  boundingEl: HTMLElement | null;

  state: WindowState;
  storedState: WindowRect | null;

  extraHeight: number;
  zIndex: number;
  noTile: boolean;
  useArena: boolean;
  useMonitor: boolean;
  showButtons: boolean;

  docking: WindowDocking;
  payload: TPayload;
  actions?: WindowActionsComponent;
}

export interface OpenWindowOptions<TPayload = unknown> {
  title?: string;
  parentId?: WindowId | null;
  boundingEl?: HTMLElement | null;
  noTile?: boolean;
  setId?: WindowId;
  props?: Record<string, unknown>;
  payload?: TPayload;
  extraHeight?: number;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  transparency?: number;
  showButtons?: boolean;
  docking?: WindowDocking;
  actions?: WindowActionsComponent;
}

export type ResizeMode =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB - EPSILON && endA > startB + EPSILON;
}

function rectOf(win: WindowInstance): WindowRect {
  const { left, top, width, height } = win.state;
  return { left, top, width, height };
}

export class WindowManager {
  windows = $state<WindowInstance[]>([]);

  useArena = $state(true);
  useMonitor = $state(false);

  private zCounter = 1;

  get winCount(): number {
    return this.windows.length;
  }

  find(id: WindowId | null | undefined): WindowInstance | undefined {
    if (!id) return undefined;
    return this.windows.find((win) => win.winId === id);
  }

  findByTitle(title: string): WindowInstance | undefined {
    return this.windows.find((win) => win.title === title);
  }

  getChildren(parentId: WindowId): WindowInstance[] {
    return this.windows.filter((win) => win.parentId === parentId);
  }

  getDescendants(parentId: WindowId): WindowInstance[] {
    const result: WindowInstance[] = [];

    const visit = (id: WindowId) => {
      for (const child of this.getChildren(id)) {
        result.push(child);
        visit(child.winId);
      }
    };

    visit(parentId);
    return result;
  }

  open<TPayload = unknown>(
    component: Component<any>,
    options: OpenWindowOptions<TPayload> = {},
  ): WindowInstance<TPayload> {
    if (options.setId) {
      const existing = this.find(options.setId);
      if (existing) return existing as WindowInstance<TPayload>;
    }

    const parent = this.find(options.parentId);
    const offset = options.noTile ? 0 : this.windows.length * 20;

    const win = $state<WindowInstance<TPayload>>({
      winId: options.setId ?? crypto.randomUUID(),
      title: options.title ?? component.name ?? "Window",
      component,
      props: options.props ?? {},

      parentId: parent?.winId ?? null,
      boundingEl: options.boundingEl ?? null,

      state: {
        left: options.left ?? offset,
        top: options.top ?? offset,
        width: options.width ?? 0,
        height: options.height ?? 0,
        isMinimized: false,
        isMaximized: false,
        transparency: options.transparency ?? 1,
      },

      storedState: null,

      extraHeight: options.extraHeight ?? 0,
      zIndex: ++this.zCounter,
      noTile: options.noTile ?? false,
      useArena: this.useArena,
      useMonitor: this.useMonitor,
      showButtons: options.showButtons ?? true,
      docking: options.docking ?? {},

      payload: (options.payload ?? {}) as TPayload,
      actions: options.actions,
    });

    this.windows.push(win);
    return win;
  }

  update(id: WindowId, updates: Partial<WindowState>): void {
    const win = this.find(id);
    if (!win) return;

    Object.assign(win.state, updates);
  }

  updatePayload<TPayload>(id: WindowId, payload: TPayload): void {
    const win = this.find(id);
    if (!win) return;

    win.payload = payload;
  }

  updateAll(updates: Partial<WindowState>): void {
    for (const win of this.windows) {
      Object.assign(win.state, updates);
    }
  }

  focus(id: WindowId): void {
    const win = this.find(id);
    if (win) win.zIndex = ++this.zCounter;
  }

  minimize(id: WindowId): void {
    const win = this.find(id);
    if (!win || win.state.isMinimized) return;

    win.storedState = rectOf(win);
    this.update(id, { isMinimized: true });
  }

  restore(id: WindowId): void {
    const win = this.find(id);
    if (!win) return;

    if (win.storedState) {
      Object.assign(win.state, win.storedState);
    }

    this.update(id, { isMinimized: false });
    this.focus(id);
  }

  /**
   * Ändrar storleken på ett fönster och flyttar angränsande
   * fönster längs gemensamma kanter.
   */
  resizeDockedWindow(
    id: WindowId,
    mode: ResizeMode | string,
    proposed: Partial<WindowRect>,
  ): void {
    const win = this.find(id);
    if (!win) return;

    const old = rectOf(win);
    const next: WindowRect = { ...old, ...proposed };

    const neighbors = this.windows.filter((other) => {
      if (other.winId === id || other.state.isMinimized) return false;

      const b = other.state;

      return (
        (mode.includes("left") &&
          Math.abs(b.left + b.width - old.left) <= EPSILON &&
          overlaps(old.top, old.top + old.height, b.top, b.top + b.height)) ||
        (mode.includes("right") &&
          Math.abs(b.left - (old.left + old.width)) <= EPSILON &&
          overlaps(old.top, old.top + old.height, b.top, b.top + b.height)) ||
        (mode.includes("top") &&
          Math.abs(b.top + b.height - old.top) <= EPSILON &&
          overlaps(old.left, old.left + old.width, b.left, b.left + b.width)) ||
        (mode.includes("bottom") &&
          Math.abs(b.top - (old.top + old.height)) <= EPSILON &&
          overlaps(old.left, old.left + old.width, b.left, b.left + b.width))
      );
    });

    if (mode.includes("left") || mode.includes("right")) {
      for (const other of neighbors) {
        const b = other.state;

        if (
          mode.includes("left") &&
          Math.abs(b.left + b.width - old.left) <= EPSILON
        ) {
          const delta = next.left - old.left;
          const allowedDelta = Math.max(delta, MIN_WIDTH - b.width);

          next.left = old.left + allowedDelta;
          next.width = old.width - allowedDelta;

          this.update(other.winId, {
            width: b.width + allowedDelta,
          });
        } else if (
          mode.includes("right") &&
          Math.abs(b.left - (old.left + old.width)) <= EPSILON
        ) {
          const delta =
            next.left + next.width - (old.left + old.width);
          const allowedDelta = Math.min(delta, b.width - MIN_WIDTH);

          next.width = old.width + allowedDelta;

          this.update(other.winId, {
            left: b.left + allowedDelta,
            width: b.width - allowedDelta,
          });
        }
      }
    }

    if (mode.includes("top") || mode.includes("bottom")) {
      for (const other of neighbors) {
        const b = other.state;

        if (
          mode.includes("top") &&
          Math.abs(b.top + b.height - old.top) <= EPSILON
        ) {
          const delta = next.top - old.top;
          const allowedDelta = Math.max(delta, MIN_HEIGHT - b.height);

          next.top = old.top + allowedDelta;
          next.height = old.height - allowedDelta;

          this.update(other.winId, {
            height: b.height + allowedDelta,
          });
        } else if (
          mode.includes("bottom") &&
          Math.abs(b.top - (old.top + old.height)) <= EPSILON
        ) {
          const delta =
            next.top + next.height - (old.top + old.height);
          const allowedDelta = Math.min(delta, b.height - MIN_HEIGHT);

          next.height = old.height + allowedDelta;

          this.update(other.winId, {
            top: b.top + allowedDelta,
            height: b.height - allowedDelta,
          });
        }
      }
    }

    this.update(id, next);
  }

  /**
   * Maximerar inom ytan mellan arbetsytans gränser och
   * angränsande fönster. Återställer föregående rektangel
   * när funktionen anropas igen.
   */
  toggleMaximize(id: WindowId, bounds: HTMLElement): void {
    const win = this.find(id);
    if (!win) return;

    if (win.state.isMaximized) {
      if (win.storedState) {
        Object.assign(win.state, win.storedState);
      }

      this.update(id, { isMaximized: false });
      this.focus(id);
      return;
    }

    win.storedState = rectOf(win);

    let maxLeft = 0;
    let maxTop = 0;
    let maxRight = bounds.clientWidth;
    let maxBottom = bounds.clientHeight;

    const a = win.state;

    for (const other of this.windows) {
      if (other.winId === id || other.state.isMinimized) continue;

      const b = other.state;

      const overlapsY =
        a.top < b.top + b.height - MAXIMIZE_EPSILON &&
        a.top + a.height > b.top + MAXIMIZE_EPSILON;

      const overlapsX =
        a.left < b.left + b.width - MAXIMIZE_EPSILON &&
        a.left + a.width > b.left + MAXIMIZE_EPSILON;

      if (
        overlapsY &&
        Math.abs(a.left - (b.left + b.width)) <= MAXIMIZE_EPSILON
      ) {
        maxLeft = Math.max(maxLeft, b.left + b.width);
      }

      if (
        overlapsY &&
        Math.abs(a.left + a.width - b.left) <= MAXIMIZE_EPSILON
      ) {
        maxRight = Math.min(maxRight, b.left);
      }

      if (
        overlapsX &&
        Math.abs(a.top - (b.top + b.height)) <= MAXIMIZE_EPSILON
      ) {
        maxTop = Math.max(maxTop, b.top + b.height);
      }

      if (
        overlapsX &&
        Math.abs(a.top + a.height - b.top) <= MAXIMIZE_EPSILON
      ) {
        maxBottom = Math.min(maxBottom, b.top);
      }
    }

    this.update(id, {
      left: maxLeft,
      top: maxTop,
      width: Math.max(0, maxRight - maxLeft),
      height: Math.max(0, maxBottom - maxTop),
      isMaximized: true,
    });

    this.focus(id);
  }

  closeWin(id: WindowId): void {
    const ids = new Set([
      id,
      ...this.getDescendants(id).map((win) => win.winId),
    ]);

    this.windows = this.windows.filter((win) => !ids.has(win.winId));
  }
}

const [getContextManager, setContextManager] =
  createContext<WindowManager>();

export function initializeWindowManager(): WindowManager {
  try {
    return getContextManager();
  } catch {
    const manager = new WindowManager();
    setContextManager(manager);
    return manager;
  }
}

export function getWindowManager(): WindowManager {
  return getContextManager();
}

2. src/lib/WindowFrame.svelte

Här flyttas musinteraktionerna till en Svelte-action, use:interaction. Actionen ansvarar för att registrera och ta bort mousedown-lyssnare, medan själva dragningen och geometrin hanteras av separata funktioner.

Jag har också inkluderat snappmål från parentId och boundingEl, utöver arbetsytan och övriga fönster.
svelte


<script lang="ts">
  import { onMount, onDestroy, type Snippet } from "svelte";
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
    const initialHeight =
      win.state.height || rect.height + win.extraHeight;

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
    if (win.state.isMaximized) return;

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

3. src/lib/WindowHost.svelte

Arbetsytan håller reda på fönstren, skickar rätt begränsningselement till varje WindowFrame och visar minimerade fönster i aktivitetsfältet. Jag har tagit bort den tomma onMount-funktionen och gjort åtkomsten till arbetsytan typmässigt säker.
svelte


<script lang="ts">
  import type { Snippet } from "svelte";
  import WindowFrame from "./WindowFrame.svelte";
  import { getWindowManager } from "./windowManager.svelte";

  interface Props {
    children?: Snippet;
    topbarContent?: Snippet;
  }

  let { children, topbarContent }: Props = $props();

  const wManager = getWindowManager();

  let contentEl = $state<HTMLElement | undefined>(undefined);

  let winCount = $derived(wManager.winCount);

  let minimizedWindows = $derived(
    wManager.windows.filter((win) => win.state.isMinimized),
  );
</script>

<div class="layout">
  <header class="topbar">
    {#if topbarContent}
      {@render topbarContent()}
    {/if}

    <span>Antal öppna fönster: {winCount}</span>
  </header>

  <main class="workspace" bind:this={contentEl}>
    {#if contentEl}
      {#each wManager.windows as win (win.winId)}
        {#if !win.state.isMinimized}
          <WindowFrame {win} bounds={contentEl}>
            {@const Component = win.component}

            <Component
              winId={win.winId}
              {...win.props}
              parentId={win.parentId}
            />
          </WindowFrame>
        {/if}
      {/each}
    {/if}

    {#if children}
      {@render children()}
    {/if}
  </main>

  <footer class="taskbar">
    <span>Taskbar</span>

    {#each minimizedWindows as win (win.winId)}
      <button
        type="button"
        class="task-btn"
        onclick={() => wManager.restore(win.winId)}
      >
        🔼 {win.title}
      </button>
    {/each}
  </footer>
</div>

<style>
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
    z-index: 10;
    flex: 0 0 2.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    background: #c1414165;
    border-top: 1px solid #999;
  }

  .task-btn {
    cursor: pointer;
  }
</style>

4. Två viktiga detaljer
Säkra städningen vid avmontering

I WindowFrame.svelte, använd den här versionen av cleanupInteraction() så att den även är säker vid serverrendering:
ts

function cleanupInteraction() {
  if (typeof window !== "undefined") {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", endInteraction);
  }

  if (typeof document !== "undefined") {
    document.body.style.userSelect = "";
  }
}

Föräldrafönster och koordinater

Snapfunktionen använder arbetsytans koordinater för både fönster och DOM-element. Om boundingEl pekar på ett element som inte delar arbetsytans koordinatsystem måste dess position omräknas, vilket implementationen gör genom att jämföra getBoundingClientRect() för elementet med arbetsytan.

Föräldrafönstrets kanter ingår också som snapmål genom parentId. Snapping är däremot inte samma sak som permanent dockning: docking-objektet sparas fortfarande, men uppdateras inte automatiskt av magnetfunktionen.
5. Funktioner efter refaktoreringen

Funktion
	

Beteende

Flytta
	

Snäpper mot arbetsytan och fönsterkanter

Resize
	

Åtta handtag med minsta bredd och höjd

Gemensam kant
	

Angränsande fönster kan ändra storlek tillsammans

Maximera
	

Beräknar tillgänglig yta mellan angränsande fönster

Återställ
	

Återgår till sparad position och storlek

Minimera
	

Sparar storleken och kan återställas från aktivitetsfältet

Auto-hide
	

Titelraden visas vid arbetsytans överkant och döljs efter 700 ms

Transparens
	

Shift + mushjul justerar transparensen

Svelte-action
	

use:interaction registrerar interaktionerna och tar bort sina lyssnare

En begränsning att känna till: resizeDockedWindow() bevarar din befintliga modell för att ändra angränsande fönster, men det är inte en fullständig dockningsgraf. Om flera fönster delar en kant och ska hålla ihop geometriskt även efter upprepade resize-operationer, behöver nästa steg vara att låta docking representera och upprätthålla de faktiska relationerna mellan fönstren.

ChatGPT is AI and can make mistakes.
