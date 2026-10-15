// windowManager.svelte.ts
import { type Component, createContext } from "svelte";

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

  tileOffset: number; // how much to offset

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
  tileOffset?: number;

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
    // deno-lint-ignore no-explicit-any
    component: Component<any>,
    options: OpenWindowOptions<TPayload> = {},
  ): WindowInstance<TPayload> {
    if (options.setId) {
      const existing = this.find(options.setId);
      if (existing) return existing as WindowInstance<TPayload>;
    }

    const parent = this.find(options.parentId);
    const tileOffset = options.tileOffset ?? 20; // Hämtar det inskickade värtet på tileOffset från den första inst
    const currentOffset = this.windows.length * tileOffset;

    const win = $state<WindowInstance<TPayload>>({
      winId: options.setId ?? crypto.randomUUID(),
      title: options.title ?? component.name ?? "Window",
      component,
      props: options.props ?? {},

      parentId: parent?.winId ?? null,
      boundingEl: options.boundingEl ?? null,

      state: {
        left: options.left ?? currentOffset,
        top: options.top ?? currentOffset,
        width: options.width ?? 0,
        height: options.height ?? 0,
        isMinimized: false,
        isMaximized: false,
        transparency: options.transparency ?? 1,
      },

      storedState: null,

      extraHeight: options.extraHeight ?? 0,
      zIndex: ++this.zCounter,
      tileOffset,

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
          const delta = next.left + next.width - (old.left + old.width);
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
          const delta = next.top + next.height - (old.top + old.height);
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
