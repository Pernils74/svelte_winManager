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
  thumbnail: string | null;
  component: Component<any> | null;
  props: Record<string, unknown>;
  parentId: WindowId | null;
  boundingEl: HTMLElement | null;
  state: WindowState;
  storedState: WindowRect | null;
  extraHeight: number;
  zIndex: number;
  tileOffset: number;
  // useArena: boolean;
  // useMonitor: boolean;
  showButtons: boolean;
  docking: WindowDocking;
  payload: TPayload;
  actions?: WindowActionsComponent;
}

export interface OpenWindowOptions<TPayload = unknown> {
  title?: string;
  parentId?: WindowId | null;
  boundingEl?: HTMLElement | null;
  tileOffset?: number;
  // noTile?: boolean;
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

  // useArena = $state(true);
  // useMonitor = $state(false);

  private zCounter = 1;

  constructor() {
    this.windows.push({
      winId: ROOT_WIN_ID,
      title: "Root Workspace",
      thumbnail: null,
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

      tileOffset: 0,
      // useArena: true,
      // useMonitor: false,
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

    const tileOffset = options.tileOffset ?? 20;
    const siblingCount = this.getChildren(parentId).length;
    // const offset = options.noTile ? 0 : siblingCount * 20;

    const currentOffset = siblingCount * tileOffset;

    const win = $state<WindowInstance<TPayload>>({
      winId: options.setId ?? crypto.randomUUID(),
      title: options.title ?? component.name ?? "Window",
      thumbnail: null,
      component,
      props: options.props ?? {},
      parentId,
      boundingEl: options.boundingEl ?? null,
      state: {
        left: options.left ?? currentOffset,
        top: options.top ?? currentOffset,
        width: options.width ?? 400,
        height: options.height ?? 300,
        isMinimized: false,
        isMaximized: false,
        transparency: options.transparency ?? 1,
      },
      storedState: null,
      extraHeight: options.extraHeight ?? 0,
      zIndex: ++this.zCounter,

      tileOffset,
      // useArena: this.useArena,
      // useMonitor: this.useMonitor,
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
      const overlapsY = a.top < b.top + b.height - MAXIMIZE_EPSILON &&
        a.top + a.height > b.top + MAXIMIZE_EPSILON;
      const overlapsX = a.left < b.left + b.width - MAXIMIZE_EPSILON &&
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

  setThumbnail(id: WindowId, thumbnail: string | null): void {
    const win = this.find(id);
    if (win) {
      win.thumbnail = thumbnail;
    }
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
