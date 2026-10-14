// import { getContext, setContext } from "svelte";

// const WINDOW_MANAGER_KEY = Symbol("window-manager");

import type { Component } from "svelte";

export const EPSILON = 3;
export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 100;

export type WindowActionsComponent = Component<{
  winId: string;
}>;

export type WindowId = string;

export type DockSide =
  | "left"
  | "right"
  | "top"
  | "bottom";

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
  component: any;
  props: Record<string, unknown>;

  // Hierarki
  parentId: WindowId | null;
  boundingEl: HTMLElement | null;

  // Reaktivt fönstertillstånd
  state: WindowState;
  storedState: WindowRect | null;

  // Layout och funktioner
  extraHeight: number;
  zIndex: number;
  noTile: boolean;
  useArena: boolean;
  useMonitor: boolean;
  showButtons: boolean;

  docking: WindowDocking; // vid open docking: {}
  // Applikationsdata, inte geometriskt UI-tillstånd
  payload: TPayload;

  actions?: WindowActionsComponent; // button etc on the top bar
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
  docking?: WindowDocking; // Lägg till den här egenskapen
  actions?: WindowActionsComponent;
}

export class WindowManager {
  windows = $state<WindowInstance[]>([]);

  useArena = $state(true);
  useMonitor = $state(false);

  private zCounter = 1;

  get winCount(): number {
    return this.windows.length;
  }

  find(id: WindowId | null | undefined) {
    if (!id) return undefined;
    return this.windows.find((win) => win.winId === id);
  }

  findByTitle(title: string) {
    return this.windows.find((win) => win.title === title);
  }

  getChildren(parentId: WindowId) {
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
    if (options.setId && this.find(options.setId)) {
      return this.find(options.setId)! as WindowInstance<TPayload>;
    }

    const parentId = options.parentId !== undefined ? options.parentId : null;

    const parent = this.find(parentId);

    const offset = options.noTile ? 0 : this.windows.length * 20;

    const win = $state<WindowInstance<TPayload>>({
      winId: options.setId ?? crypto.randomUUID(),
      title: options.title ?? component.name ?? "Window",
      component,
      props: options.props ?? {},

      parentId: parent ? parent.winId : null,
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
      docking: options.docking ?? {}, //false, // Initiera docking egenskapen här

      payload: (options.payload ?? {}) as TPayload,
      actions: options.actions,
    });

    this.windows.push(win);
    return win;
  }

  update(id: WindowId, updates: Partial<WindowState>) {
    const win = this.find(id);
    if (!win) return;

    Object.assign(win.state, updates);
  }

  updatePayload<TPayload>(
    id: WindowId,
    payload: TPayload,
  ) {
    const win = this.find(id);
    if (!win) return;

    win.payload = payload;
  }

  updateAll(updates: Partial<WindowState>) {
    for (const win of this.windows) {
      Object.assign(win.state, updates);
    }
  }

  focus(id: WindowId) {
    const win = this.find(id);
    if (win) win.zIndex = ++this.zCounter;
  }

  minimize(id: WindowId) {
    const win = this.find(id);
    if (!win || win.state.isMinimized) return;

    win.storedState = {
      left: win.state.left,
      top: win.state.top,
      width: win.state.width,
      height: win.state.height,
    };

    this.update(id, { isMinimized: true });
  }

  resizeDockedWindow(
    id: WindowId,
    mode: string,
    proposed: Partial<WindowRect>,
  ) {
    const win = this.find(id);
    if (!win) return;

    const old = { ...win.state };
    const next = { ...old, ...proposed };

    // const EPSILON = 3;
    // const MIN_WIDTH = 160;
    // const MIN_HEIGHT = 100;

    const overlaps = (
      startA: number,
      endA: number,
      startB: number,
      endB: number,
    ) => startA < endB - EPSILON && endA > startB + EPSILON;

    const neighbors = this.windows.filter((other) => {
      if (other.winId === id || other.state.isMinimized) {
        return false;
      }

      const a = old;
      const b = other.state;

      return (
        (mode.includes("left") &&
          Math.abs(b.left + b.width - a.left) <= EPSILON &&
          overlaps(a.top, a.top + a.height, b.top, b.top + b.height)) ||
        (mode.includes("right") &&
          Math.abs(b.left - (a.left + a.width)) <= EPSILON &&
          overlaps(a.top, a.top + a.height, b.top, b.top + b.height)) ||
        (mode.includes("top") &&
          Math.abs(b.top + b.height - a.top) <= EPSILON &&
          overlaps(a.left, a.left + a.width, b.left, b.left + b.width)) ||
        (mode.includes("bottom") &&
          Math.abs(b.top - (a.top + a.height)) <= EPSILON &&
          overlaps(a.left, a.left + a.width, b.left, b.left + b.width))
      );
    });

    // Dra i en gemensam vertikal kant.
    if (mode.includes("left") || mode.includes("right")) {
      for (const other of neighbors) {
        const b = other.state;

        if (
          mode.includes("left") &&
          Math.abs(b.left + b.width - old.left) <= EPSILON
        ) {
          // Grannen ligger till vänster.
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
          // Grannen ligger till höger.
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

    // Dra i en gemensam horisontell kant.
    if (mode.includes("top") || mode.includes("bottom")) {
      for (const other of neighbors) {
        const b = other.state;

        if (
          mode.includes("top") &&
          Math.abs(b.top + b.height - old.top) <= EPSILON
        ) {
          // Grannen ligger ovanför.
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
          // Grannen ligger nedanför.
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

  restore(id: WindowId) {
    const win = this.find(id);
    if (!win) return;

    if (win.storedState) {
      Object.assign(win.state, win.storedState);
    }

    this.update(id, { isMinimized: false });
    this.focus(id);
  }

  toggleMaximize(id: WindowId, bounds: HTMLElement) {
    const win = this.find(id);
    if (!win) return;

    if (!win.state.isMaximized) {
      // Spara det nuvarande flytande tillståndet först
      win.storedState = {
        left: win.state.left,
        top: win.state.top,
        width: win.state.width,
        height: win.state.height,
      };

      // Standardgränser (hela skärmen)
      let maxLeft = 0;
      let maxTop = 0;
      let maxRight = bounds.clientWidth;
      let maxBottom = bounds.clientHeight;

      const EPSILON = 5; // Felmarginal i pixlar för att upptäcka dockning

      // Gå igenom alla andra öppna fönster för att hitta dockade grannar
      for (const other of this.windows) {
        if (other.winId === id || other.state.isMinimized) continue;

        const a = win.state;
        const b = other.state;

        // Kolla om fönstren överlappar vertikalt eller horisontellt
        const overlapsY = a.top < b.top + b.height - EPSILON &&
          a.top + a.height > b.top + EPSILON;
        const overlapsX = a.left < b.left + b.width - EPSILON &&
          a.left + a.width > b.left + EPSILON;

        // 1. Är vi dockade mot ett fönster till VÄNSTER? (Vår vänsterkant rör vid dess högerkant)
        if (overlapsY && Math.abs(a.left - (b.left + b.width)) <= EPSILON) {
          maxLeft = Math.max(maxLeft, b.left + b.width);
        }
        // 2. Är vi dockade mot ett fönster till HÖGER? (Vår högerkant rör vid dess vänsterkant)
        if (overlapsY && Math.abs((a.left + a.width) - b.left) <= EPSILON) {
          maxRight = Math.min(maxRight, b.left);
        }
        // 3. Är vi dockade mot ett fönster OVANFÖR? (Vår överkant rör vid dess underkant)
        if (overlapsX && Math.abs(a.top - (b.top + b.height)) <= EPSILON) {
          maxTop = Math.max(maxTop, b.top + b.height);
        }
        // 4. Är vi dockade mot ett fönster NEDANFÖR? (Vår underkant rör vid dess överkant)
        if (overlapsX && Math.abs((a.top + a.height) - b.top) <= EPSILON) {
          maxBottom = Math.min(maxBottom, b.top);
        }
      }

      // Uppdatera fönstret till den beräknade, smarta maxytan
      this.update(id, {
        left: maxLeft,
        top: maxTop,
        width: maxRight - maxLeft,
        height: maxBottom - maxTop,
        isMaximized: true,
      });
    } else {
      // Återställ till den sparade storleken
      const previous = win.storedState;
      if (previous) {
        Object.assign(win.state, previous);
      }
      this.update(id, { isMaximized: false });
    }
    this.focus(id);
  }

  toggleMaximize_old(id: WindowId, bounds: HTMLElement) {
    const win = this.find(id);
    if (!win) return;

    if (!win.state.isMaximized) {
      win.storedState = {
        left: win.state.left,
        top: win.state.top,
        width: win.state.width,
        height: win.state.height,
      };

      this.update(id, {
        left: 0,
        top: 0,
        width: bounds.clientWidth,
        height: bounds.clientHeight,
        isMaximized: true,
      });
    } else {
      const previous = win.storedState;

      if (previous) {
        Object.assign(win.state, previous);
      }

      this.update(id, { isMaximized: false });
    }

    this.focus(id);
  }

  closeWin(id: WindowId) {
    const ids = new Set([
      id,
      ...this.getDescendants(id).map((win) => win.winId),
    ]);

    this.windows = this.windows.filter(
      (win) => !ids.has(win.winId),
    );
  }
}

import { createContext } from "svelte";

// createContext returnerar en array: [get, set, has]
const [getContextManager, setContextManager] = createContext<WindowManager>();

export function initializeWindowManager() {
  // Vi kollar om kontexten redan finns i den här noden innan vi sätter en ny
  try {
    const existing = getContextManager();
    if (existing) return existing;
  } catch {
    // createContext kastar ett fel om get() anropas där ingen kontext satts
  }

  const manager = new WindowManager();
  setContextManager(manager); // Används som en funktion, inte en metod!

  return manager;
}

export function getWindowManager() {
  return getContextManager(); // Returnerar din WindowManager fullt typad
}
