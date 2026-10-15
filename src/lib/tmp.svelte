1. src/lib/windowManager.svelte.ts

Den här filen innehåller tillstånd, root-instans, relationer mellan föräldrar och barn, fönsterduplicering samt docknings- och storlekslogik.
typescript


import { type Component, createContext } from "svelte";

export const ROOT_WIN_ID = "root";
export const EPSILON = 3;
export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 100;

const MAXIMIZE_EPSILON = 5;

export type WindowId = string;
export type DockSide = "left" | "right" | "top" | "bottom";
export type ResizeMode =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

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
  component: Component<any> | null;
  props: Record<string, unknown>;
  parentId: WindowId | null;
  boundingEl: HTMLElement | null;
  state: WindowState;
  storedState: WindowRect | null;
  extraHeight: number;
  zIndex: number;
  noTile: boolean;
  tileOffset: number;
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

function rectOf(win: WindowInstance): WindowRect {
  const { left, top, width, height } = win.state;
  return { left, top, width, height };
}

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB - EPSILON && endA > startB + EPSILON;
}

export class WindowManager {
  windows = $state<WindowInstance[]>([]);

  useArena = $state(true);
  useMonitor = $state(false);

  private zCounter = 1;

  constructor() {
    this.windows.push({
      winId: ROOT_WIN_ID,
      title: "Root Workspace",
      component: null,
      props: {},
      parentId: null,
      boundingEl: null,
      state: {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
        isMinimized: false,
        isMaximized: false,
        transparency: 1,
      },
      storedState: null,
      extraHeight: 0,
      zIndex: 0,
      noTile: true,
      tileOffset: 0,
      useArena: true,
      useMonitor: false,
      showButtons: false,
      docking: {},
      payload: null,
    });
  }

  get winCount(): number {
    return this.windows.filter(
      (win) => win.winId !== ROOT_WIN_ID,
    ).length;
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
    const visited = new Set<WindowId>();

    const visit = (id: WindowId) => {
      if (visited.has(id)) return;
      visited.add(id);

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

    const requestedParent = options.parentId ?? ROOT_WIN_ID;
    const parent = this.find(requestedParent);
    const parentId = parent ? parent.winId : ROOT_WIN_ID;

    const siblingCount = this.getChildren(parentId).length;
    const offset = options.noTile ? 0 : siblingCount * 20;

    const win = $state<WindowInstance<TPayload>>({
      winId: options.setId ?? crypto.randomUUID(),
      title: options.title ?? component.name ?? "Window",
      component,
      props: options.props ?? {},
      parentId,
      boundingEl: options.boundingEl ?? null,
      state: {
        left: options.left ?? offset,
        top: options.top ?? offset,
        width: options.width ?? 400,
        height: options.height ?? 300,
        isMinimized: false,
        isMaximized: false,
        transparency: options.transparency ?? 1,
      },
      storedState: null,
      extraHeight: options.extraHeight ?? 0,
      zIndex: ++this.zCounter,
      noTile: options.noTile ?? false,
      tileOffset: offset,
      useArena: this.useArena,
      useMonitor: this.useMonitor,
      showButtons: options.showButtons ?? true,
      docking: options.docking ?? {},
      payload: (options.payload ?? null) as TPayload,
      actions: options.actions,
    });

    this.windows.push(win);
    return win;
  }

  /**
   * Skapar en fristående kopia av ett fönster.
   * Kopian behåller förälder, komponent, props och utseende,
   * men får ett nytt ID och en egen position.
   */
  duplicate(id: WindowId, offset = 24): WindowInstance | undefined {
    const source = this.find(id);
    if (!source || source.winId === ROOT_WIN_ID || !source.component) {
      return undefined;
    }

    const copy = this.open(source.component, {
      title: `${source.title} (kopia)`,
      parentId: source.parentId ?? ROOT_WIN_ID,
      boundingEl: source.boundingEl,
      props: { ...source.props },
      payload: source.payload,
      extraHeight: source.extraHeight,
      left: source.state.left + offset,
      top: source.state.top + offset,
      width: source.state.width,
      height: source.state.height,
      transparency: source.state.transparency,
      showButtons: source.showButtons,
      docking: {},
      noTile: true,
      actions: source.actions,
    });

    this.focus(copy.winId);
    return copy;
  }

  update(id: WindowId, updates: Partial<WindowState>): void {
    const win = this.find(id);
    if (!win || win.winId === ROOT_WIN_ID) {
      if (win?.winId === ROOT_WIN_ID) {
        Object.assign(win.state, updates);
      }
      return;
    }

    Object.assign(win.state, updates);
  }

  updatePayload<TPayload>(id: WindowId, payload: TPayload): void {
    const win = this.find(id);
    if (win) win.payload = payload;
  }

  updateAll(updates: Partial<WindowState>): void {
    for (const win of this.windows) {
      if (win.winId !== ROOT_WIN_ID) {
        Object.assign(win.state, updates);
      }
    }
  }

  setRootBounds(width: number, height: number): void {
    const root = this.find(ROOT_WIN_ID);
    if (!root) return;

    Object.assign(root.state, {
      left: 0,
      top: 0,
      width: Math.max(0, width),
      height: Math.max(0, height),
    });
  }

  focus(id: WindowId): void {
    const win = this.find(id);
    if (win && win.winId !== ROOT_WIN_ID) {
      win.zIndex = ++this.zCounter;
    }
  }

  minimize(id: WindowId): void {
    const win = this.find(id);
    if (!win || win.winId === ROOT_WIN_ID || win.state.isMinimized) {
      return;
    }

    win.storedState = rectOf(win);
    this.update(id, { isMinimized: true });
  }

  restore(id: WindowId): void {
    const win = this.find(id);
    if (!win || win.winId === ROOT_WIN_ID) return;

    if (win.storedState) {
      Object.assign(win.state, win.storedState);
    }

    this.update(id, { isMinimized: false });
    this.focus(id);
  }

  resizeDockedWindow(
    id: WindowId,
    mode: ResizeMode | string,
    proposed: Partial<WindowRect>,
  ): void {
    const win = this.find(id);
    if (!win || win.winId === ROOT_WIN_ID) return;

    const old = rectOf(win);
    const next: WindowRect = { ...old, ...proposed };

    // Endast syskon i samma koordinatsystem kan påverkas.
    const siblings = this.getChildren(win.parentId ?? ROOT_WIN_ID);
    const neighbors = siblings.filter((other) => {
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
          const allowed = Math.max(delta, MIN_WIDTH - b.width);
          next.left = old.left + allowed;
          next.width = old.width - allowed;
          this.update(other.winId, { width: b.width + allowed });
        } else if (
          mode.includes("right") &&
          Math.abs(b.left - (old.left + old.width)) <= EPSILON
        ) {
          const delta = next.left + next.width - (old.left + old.width);
          const allowed = Math.min(delta, b.width - MIN_WIDTH);
          next.width = old.width + allowed;
          this.update(other.winId, {
            left: b.left + allowed,
            width: b.width - allowed,
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
          const allowed = Math.max(delta, MIN_HEIGHT - b.height);
          next.top = old.top + allowed;
          next.height = old.height - allowed;
          this.update(other.winId, { height: b.height + allowed });
        } else if (
          mode.includes("bottom") &&
          Math.abs(b.top - (old.top + old.height)) <= EPSILON
        ) {
          const delta = next.top + next.height - (old.top + old.height);
          const allowed = Math.min(delta, b.height - MIN_HEIGHT);
          next.height = old.height + allowed;
          this.update(other.winId, {
            top: b.top + allowed,
            height: b.height - allowed,
          });
        }
      }
    }

    this.update(id, next);
  }

  toggleMaximize(id: WindowId, bounds: HTMLElement): void {
    const win = this.find(id);
    if (!win || win.winId === ROOT_WIN_ID) return;

    if (win.state.isMaximized) {
      if (win.storedState) Object.assign(win.state, win.storedState);
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
    const siblings = this.getChildren(win.parentId ?? ROOT_WIN_ID);

    for (const other of siblings) {
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
    if (id === ROOT_WIN_ID) return;

    const ids = new Set([
      id,
      ...this.getDescendants(id).map((win) => win.winId),
    ]);

    this.windows = this.windows.filter((win) => !ids.has(win.winId));
  }
}

const [getContextManager, setContextManager] = createContext<WindowManager>();

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

2. src/lib/WindowHost.svelte

WindowHost äger den synliga skrivbordytan och synkroniserar dess faktiska storlek med root-instansen. Det renderar bara rotens direkta barn. Undernivåerna hanteras av respektive fönster.
svelte


<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import WindowFrame from "./WindowFrame.svelte";
  import {
    ROOT_WIN_ID,
    getWindowManager,
  } from "./windowManager.svelte";

  interface Props {
    children?: Snippet;
    topbarContent?: Snippet;
  }

  let { children, topbarContent }: Props = $props();

  const wManager = getWindowManager();

  let contentEl = $state<HTMLElement | undefined>(undefined);

  let winCount = $derived(wManager.winCount);
  let minimizedWindows = $derived(
    wManager.windows.filter(
      (win) =>
        win.winId !== ROOT_WIN_ID && win.state.isMinimized,
    ),
  );
  let rootWindows = $derived(wManager.getChildren(ROOT_WIN_ID));

  onMount(() => {
    if (!contentEl) return;

    const updateBounds = () => {
      if (!contentEl) return;
      wManager.setRootBounds(
        contentEl.clientWidth,
        contentEl.clientHeight,
      );
    };

    updateBounds();

    const observer = new ResizeObserver(updateBounds);
    observer.observe(contentEl);

    return () => observer.disconnect();
  });
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
      {#each rootWindows as win (win.winId)}
        {#if !win.state.isMinimized}
          <WindowFrame win={win} bounds={contentEl}>
            {#if win.component}
              {@const Component = win.component}
              <Component
                winId={win.winId}
                {...win.props}
                parentId={win.parentId}
              />
            {/if}
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

3. src/lib/WindowFrame.svelte

Den här versionen hanterar både vanliga fönster och fönster som innehåller andra fönster. Ctrl + dra duplicerar fönstret och fortsätter dragningen med den nya instansen.
svelte


<script lang="ts">
  import { onDestroy, onMount, type Snippet } from "svelte";
  import {
    MIN_HEIGHT,
    MIN_WIDTH,
    ROOT_WIN_ID,
    type ResizeMode,
    type WindowInstance,
    type WindowRect,
    getWindowManager,
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
  let contentEl: HTMLDivElement;

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
    for (const other of manager.getChildren(
      win.parentId ?? ROOT_WIN_ID,
    )) {
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

    if (win.state.isMaximized) return;

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
        <WindowFrame win={child} bounds={contentEl}>
          {@const ChildComponent = child.component}
          <ChildComponent
            winId={child.winId}
            {...child.props}
            parentId={child.parentId}
          />
        </WindowFrame>
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

4. Viktiga detaljer vid integreringen
Öppna ett nytt fönster

Om inget parentId anges öppnas fönstret direkt i skrivbordets rot. Om du anger ett befintligt fönster-ID blir det i stället ett underfönster.
ts

manager.open(MyComponent, {
  title: "Nytt fönster",
  width: 500,
  height: 350,
});

// Öppna ett fönster inuti ett annat.
manager.open(MyComponent, {
  title: "Underfönster",
  parentId: existingWindowId,
  width: 300,
  height: 200,
});

Hämta fönsterträdet
ts

const rootChildren = manager.getChildren(ROOT_WIN_ID);

const nestedWindows = manager.getDescendants(existingWindowId);

Saker att kontrollera före produktionssättning

    Koordinatsystem: alla left och top är nu relativa till förälderns innehållsyta. Om befintliga komponenter antar att koordinaterna alltid är relativa till hela skrivbordet måste de uppdateras.

    Maximering: gränserna beräknas mot det aktuella föräldraelementet och dess syskon. Rotens bredd och höjd uppdateras med ResizeObserver.

    Kopiering: duplicate() kopierar fönstrets komponent, props och grundläggande inställningar. Det kopierar inte automatiskt hela underträdet eller djupt klonar eventuella objekt i props.

    Svelte-kontekst: initializeWindowManager() måste fortfarande köras i rätt Svelte-kontekst innan WindowHost och fönsterkomponenterna använder getWindowManager().

Obs: koden ovan är en komplett grundimplementation av de tre filerna, men den är inte verifierad genom en TypeScript-/Svelte-kompilering. Jag rekommenderar att köra projektets npm run check och npm run build efter att du ersatt filerna. Särskilt den rekursiva renderingens koordinater och Ctrl-drag bör testas med flera nästlade fönster innan ändringen betraktas som färdig.

ChatGPT is AI and can make mistakes.
Chat with ChatGPT
