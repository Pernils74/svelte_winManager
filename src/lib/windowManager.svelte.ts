// windowManager.svelte.ts
// WindowManager
//  ├─ open()
//  ├─ close()
//  ├─ duplicate()
//  ├─ focus()
//  ├─ reparent()
//  ├─ detach()
//  ├─ restore()
//  │
//  ├─ payload sync
//  ├─ props sync
//  ├─ backend sync
//  │
//  ├─ window tree
//  ├─ parent/child relationer
//  ├─ z-order
//  ├─ docking state
//  └─ window state

// windowFrame.svelte
//  WindowFrame
//  ├─ drag
//  ├─ resize
//  ├─ maximize
//  ├─ minimize
//  ├─ snap
//  ├─ docking visuals
//  ├─ titlebar
//  ├─ titlebar hide/show
//  ├─ resize handles
//  ├─ thumbnail capture
//  ├─ transitions
//  └─ children rendering

// WindowHost
// ├─ render root windows
// ├─ render taskbar
// ├─ render wallpaper
// └─ render snippets

// borde vara
// WindowManager
//     Model

// WindowFrame
//     View

// WindowHost
//     Viewport

// WindowManager
// ├─ open()
// ├─ close()
// ├─ duplicate()
// ├─ detach()
// ├─ reattach()
// ├─ bootstrapDetached()
// ├─ payload sync
// ├─ props sync
// ├─ backend sync
// ├─ state
// ├─ hierarchy
// └─ context

// WindowHost
// ├─ workspace
// ├─ detached renderer
// ├─ taskbar
// ├─ wallpaper
// └─ root bounds

// WindowFrame
// ├─ drag
// ├─ resize
// ├─ maximize
// ├─ minimize
// ├─ snap
// ├─ docking visuals
// ├─ titlebar
// └─ thumbnail

// WindowBackend
//  ├─ browser tab
//  ├─ browser popup window
//  ├─ tauri window
//  │
//  ├─ open
//  ├─ close
//  ├─ send
//  ├─ receive
//  │
//  ├─ BroadcastChannel
//  ├─ localStorage handoff
//  └─ Tauri events

import { type Component, createContext } from "svelte";
import { getComponentKey } from "./windowRegistry.ts";

import { createWindowBackend, type WindowBackend, type WindowTarget } from "./windowBackend.ts";

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

// export type WindowTiltlebarComponent = Component<{ winId: string }>;
export type WindowTiltlebarComponent = Component<WindowComponentProps<any>>;

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

/**
 * Core properties automatically passed down to every application component
 * rendered inside a window frame. Import this to type-safe your Svelte 5 props.
 */
// Ändra denna rad i din windowManager.svelte.ts

export interface WindowComponentProps<TPayload = any> {
	/**
	 * The full, reactive window instance object.
	 * Provides direct access to changing the title, reading window bounds, payload, and frame state.
	 */
	win: WindowInstance<TPayload>;

	/**
	 * The unique identifier for this window instance (usually a crypto UUID).
	 * Commonly passed into manager methods to target this specific window.
	 */
	winId: WindowId;

	/**
	 * The unique ID of the parent window context.
	 * Returns `null` if the window is resting directly on the main desktop wallpaper root.
	 */
	parentId: WindowId | null;
}

type WindowContext =
	| { type: "workspace" }
	| { type: "browser-tab" }
	| { type: "browser-window" }
	| { type: "tauri-window" };

export interface WindowInstance<TPayload = unknown> {
	winId: WindowId;
	title: string;
	thumbnail: string | null;
	component: Component<any> | null;
	componentKey?: string; // component as string, needed for browsertab and tauri backend
	props: Record<string, unknown>;
	parentId: WindowId | null;
	boundingEl: HTMLElement | null;
	state: WindowState;
	storedState: WindowRect | null;

	zIndex: number;
	tileOffset: number;
	// useArena: boolean;
	// useMonitor: boolean;
	showButtons: boolean;
	docking: WindowDocking;
	payload: TPayload;
	titlebar?: WindowTiltlebarComponent;
	isDetached: boolean;
	context: WindowContext;
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

	left?: number;
	top?: number;
	width?: number;
	height?: number;
	transparency?: number;
	showButtons?: boolean;
	docking?: WindowDocking;
	titlebar?: WindowTiltlebarComponent;
	componentKey?: string;
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

	// private readonly backend: WindowBackend;
	backend: WindowBackend;
	// constructor() {

	constructor(backend: WindowBackend = createWindowBackend()) {
		this.backend = backend;

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

			zIndex: 0,

			tileOffset: 0,
			// useArena: true,
			// useMonitor: false,
			showButtons: false,
			docking: {},
			payload: null,
			isDetached: false,
			context: { type: "workspace" },
		});

		if (typeof window !== "undefined") {
			// Vi kan tjuvlyssna på backend-managerns interna meddelandehantering.
			// Eftersom du har BroadcastChannel instansierad i din backend, modifierar vi
			// handleBrowserMessage i windowBackend.ts så att huvudappen också reagerar!
		}
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
		const compKey = options.componentKey ?? getComponentKey(component);

		// console.log("[open] component.name", component.name);
		// console.log("[open] componentKey", compKey);

		const win = $state<WindowInstance<TPayload>>({
			winId: options.setId ?? crypto.randomUUID(),
			title: options.title ?? component.name ?? "Window",
			thumbnail: null,
			component,
			componentKey: compKey, //options.componentKey,
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

			zIndex: ++this.zCounter,

			tileOffset,
			// useArena: this.useArena,
			// useMonitor: this.useMonitor,
			showButtons: options.showButtons ?? true,
			docking: options.docking ?? {},
			payload: (options.payload ?? null) as TPayload,
			// payload: options.payload ? $state(options.payload) : (null as any),
			titlebar: options.titlebar,
			isDetached: false,
			context: { type: "workspace" },
		});

		this.windows.push(win);
		return win;
	}

	/**
	 * Skapar en fristående kopia av ett fönster.
	 * Kopian behåller förälder, komponent, props och utseende,
	 * men får ett nytt ID och en egen position.
	 */

	/**
	 * Creates a standalone copy of a window instance.
	 * The duplicate retains components, props, parentage, and styles,
	 * but receives a unique ID and an offset position.
	 */
	duplicate(source: WindowInstance, offset = 24): WindowInstance | undefined {
		if (!source || source.winId === ROOT_WIN_ID || !source.component) {
			return undefined;
		}

		const wincopy = this.open(source.component, {
			title: `${source.title} (kopia)`,
			parentId: source.parentId ?? ROOT_WIN_ID,
			boundingEl: source.boundingEl,
			props: { ...source.props },
			payload: source.payload,

			left: source.state.left + offset,
			top: source.state.top + offset,
			width: source.state.width,
			height: source.state.height,
			transparency: source.state.transparency,
			showButtons: source.showButtons,
			docking: {},
			titlebar: source.titlebar,
		});

		this.focus(wincopy);
		return wincopy;
	}

	reparent(
		id: WindowId,
		newParentId: WindowId,
		screenRect?: {
			left?: number;
			top?: number;
			width?: number;
			height?: number;
		},
	): boolean {
		const win = this.find(id);
		const newParent = this.find(newParentId);

		if (!win || !newParent || id === ROOT_WIN_ID) {
			return false;
		}

		// Förhindra att ett fönster blir sin egen förälder
		// eller flyttas in i ett av sina egna barn.
		if (
			id === newParentId ||
			this.getDescendants(id).some(
				(child) => child.winId === newParentId,
			)
		) {
			return false;
		}

		// Hämta den gamla förälderns koordinatsystem.
		const oldParentElement = win.boundingEl;
		const oldParentRect = oldParentElement?.getBoundingClientRect();

		// Hämta den nya förälderns koordinatsystem.
		const parentElement = newParentId === ROOT_WIN_ID ? null : newParent.boundingEl;

		const parentRect = parentElement?.getBoundingClientRect();

		// Beräkna storleken på den gamla förälderns yta.
		const oldParentWidth = oldParentRect?.width ??
			this.find(win.parentId)?.state.width ??
			0;

		const oldParentHeight = oldParentRect?.height ??
			this.find(win.parentId)?.state.height ??
			0;

		// Beräkna storleken på den nya förälderns yta.
		const newParentWidth = parentRect?.width ??
			newParent.state.width ??
			0;

		const newParentHeight = parentRect?.height ??
			newParent.state.height ??
			0;

		// Fönstrets nuvarande position i skärmkoordinater.
		const currentAbsoluteLeft = (oldParentRect?.left ?? 0) + win.state.left;

		const currentAbsoluteTop = (oldParentRect?.top ?? 0) + win.state.top;

		// Använd skärmpositionen från dragningen om den finns.
		const targetScreenLeft = screenRect?.left ?? currentAbsoluteLeft;

		const targetScreenTop = screenRect?.top ?? currentAbsoluteTop;

		// Använd angiven storlek om den skickats med.
		const sourceWidth = screenRect?.width ?? win.state.width;

		const sourceHeight = screenRect?.height ?? win.state.height;

		// Konvertera skärmpositionen till den gamla
		// förälderns lokala koordinater.
		const oldLocalLeft = targetScreenLeft - (oldParentRect?.left ?? 0);

		const oldLocalTop = targetScreenTop - (oldParentRect?.top ?? 0);

		// Skala positionen proportionellt mellan föräldrarna.
		const scaleX = oldParentWidth > 0 && newParentWidth > 0 ? newParentWidth / oldParentWidth : 1;

		const scaleY = oldParentHeight > 0 && newParentHeight > 0 ? newParentHeight / oldParentHeight : 1;

		let left = oldLocalLeft * scaleX;
		let top = oldLocalTop * scaleY;

		// Skala även fönstrets storlek.
		let width = sourceWidth * scaleX;
		let height = sourceHeight * scaleY;

		// Begränsa storleken till den nya förälderns yta.
		if (newParentWidth > 0) {
			width = Math.min(width, newParentWidth);
		}

		if (newParentHeight > 0) {
			height = Math.min(height, newParentHeight);
		}

		// Begränsa positionen så att hela fönstret ryms.
		if (newParentWidth > 0) {
			left = Math.max(
				0,
				Math.min(left, newParentWidth - width),
			);
		} else {
			left = Math.max(0, left);
		}

		if (newParentHeight > 0) {
			top = Math.max(
				0,
				Math.min(top, newParentHeight - height),
			);
		} else {
			top = Math.max(0, top);
		}

		// Uppdatera föräldrarelationen.
		win.parentId = newParentId;
		win.boundingEl = parentElement;

		// Uppdatera position och storlek.
		win.state.left = left;
		win.state.top = top;
		win.state.width = width;
		win.state.height = height;

		// Fokusera det flyttade fönstret.
		// this.focus(id);
		this.focus(win);

		return true;
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

	// updatePayload_old<TPayload>(id: WindowId, payload: TPayload): void {
	//   const win = this.find(id);
	//   if (win) win.payload = payload;
	// }

	updatePayload<TPayload>(id: WindowId, payload: TPayload): void {
		const win = this.find(id);
		if (!win) return;

		// 🟢 Skydd mot eviga loopar: Jämför strängifierad data
		const oldPayloadStr = JSON.stringify($state.snapshot(win.payload));
		const newPayloadStr = JSON.stringify(payload);

		if (oldPayloadStr !== newPayloadStr) {
			// Om det är ett existerande reaktivt objekt vill vi helst inte skriva över
			// referensen helt om det går, men för enkelhetens skull skriver vi över
			// eller mergar fält för fält för att behålla reaktivitet:
			if (
				win.payload && typeof win.payload === "object" &&
				typeof payload === "object"
			) {
				Object.assign(win.payload, payload);
			} else {
				win.payload = payload;
			}
		}
	}

	updateProps(
		id: WindowId,
		props: Record<string, unknown>,
	): void {
		const win = this.find(id);
		if (!win) return;
		let changed = false;
		for (const [key, value] of Object.entries(props)) {
			if (win.props[key] !== value) {
				changed = true;
				break;
			}
		}
		if (!changed) return;
		Object.assign(win.props, props);
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

	// focus(id: WindowId): void {
	focus(win: WindowInstance): void {
		// const win = this.find(id);
		if (win && win.winId !== ROOT_WIN_ID) {
			win.zIndex = ++this.zCounter;
		}
	}

	minimize(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID || win.state.isMinimized) return;
		win.storedState = rectOf(win);
		win.state.isMinimized = true; // Du kan skriva direkt till statet eftersom det är en runa!
	}

	restore(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;
		if (win.storedState) Object.assign(win.state, win.storedState);
		win.state.isMinimized = false;
		this.focus(win); // Skicka vidare objektet till nästa metod
	}

	/**
	 * Resizes a window while proportionally expanding or shrinking adjacent docked sibling windows.
	 */
	resizeDockedWindow(
		win: WindowInstance,
		mode: ResizeMode | string,
		proposed: Partial<WindowRect>,
	): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		const old = rectOf(win);
		const next: WindowRect = { ...old, ...proposed };

		// Endast syskon i samma koordinatsystem kan påverkas.
		const siblings = this.getChildren(win.parentId ?? ROOT_WIN_ID);
		const neighbors = siblings.filter((other) => {
			if (other.winId === win.winId || other.state.isMinimized) return false;

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

					// 🌟 Skriv direkt till grannens reaktiva tillstånd istället för this.update
					other.state.width = b.width + allowed;
				} else if (
					mode.includes("right") &&
					Math.abs(b.left - (old.left + old.width)) <= EPSILON
				) {
					const delta = next.left + next.width - (old.left + old.width);
					const allowed = Math.min(delta, b.width - MIN_WIDTH);
					next.width = old.width + allowed;

					// 🌟 Ingen update behövs, tilldela fälten direkt
					other.state.left = b.left + allowed;
					other.state.width = b.width - allowed;
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

					// 🌟 Skriv direkt till grannens höjd
					other.state.height = b.height + allowed;
				} else if (
					mode.includes("bottom") &&
					Math.abs(b.top - (old.top + old.height)) <= EPSILON
				) {
					const delta = next.top + next.height - (old.top + old.height);
					const allowed = Math.min(delta, b.height - MIN_HEIGHT);
					next.height = old.height + allowed;

					// 🌟 Uppdatera grannens reaktiva topp-läge och höjd direkt
					other.state.top = b.top + allowed;
					other.state.height = b.height - allowed;
				}
			}
		}

		// 🌟 Slutligen uppdaterar vi det dragna fönstrets egna koordinater med Object.assign
		Object.assign(win.state, next);
	}

	resizeDockedWindow_old(
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

	toggleMaximize(win: WindowInstance, bounds: HTMLElement): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		if (win.state.isMaximized) {
			if (win.storedState) {
				Object.assign(win.state, win.storedState);
			}
			win.state.isMaximized = false;
			this.focus(win);
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
			if (other.winId === win.winId || other.state.isMinimized) continue;

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

		// 🌟 Uppdatera alla reaktiva värden direkt på objektet i en enda stöt
		Object.assign(win.state, {
			left: maxLeft,
			top: maxTop,
			width: Math.max(0, maxRight - maxLeft),
			height: Math.max(0, maxBottom - maxTop),
			isMaximized: true,
		});

		this.focus(win);
	}

	/**
	 * Startar dubbelriktad payload-synk för ett specifikt frikopplat fönster.
	 * Används både av huvudappen vid sömlös MDI-reparenting och av standalone-flikar.
	 */
	setupStandaloneSync(winId: WindowId): () => void {
		// 1. Lyssna inåt
		// const unsubscribeMessage = this.backend.onMessage(
		//   winId,
		//   (incomingPayload) => {
		//     this.updatePayload(winId, incomingPayload);
		//   },
		// );

		// const unsubscribeMessage = this.backend.onMessage(
		//   winId,
		//   (state) => {
		//     this.updatePayload(winId, state.payload);
		//   },
		// );

		const unsubscribeMessage = this.backend.onMessage(
			winId,
			(state) => {
				const win = this.find(winId);
				if (!win) return;
				this.updatePayload(winId, state.payload);
				this.updateProps(winId, state.props);
				// win.props = state.props;
			},
		);

		// 2. Strömma utåt reaktivt
		const cleanupEffect = $effect.root(() => {
			// $effect(() => {
			//   const win = this.find(winId);
			//   if (!win || !win.payload) return;

			//   const currentPayload = $state.snapshot(win.payload);
			//   const cleanPayload = Object.fromEntries(
			//     Object.entries(currentPayload ?? {}).filter(([, val]) =>
			//       typeof val !== "function"
			//     ),
			//   );
			//   // this.backend.send(winId, cleanPayload);
			//   this.backend.send(winId, {
			//     payload: cleanPayload,
			//     props: $state.snapshot(win.props),
			//   });
			// });

			$effect(() => {
				const win = this.find(winId);
				if (!win) return;

				const payload = $state.snapshot(win.payload);
				const props = $state.snapshot(win.props);

				this.backend.send(winId, {
					payload,
					props,
				});
			});
		});

		return () => {
			unsubscribeMessage();
			cleanupEffect();
		};
	}

	async detachWindow(
		win: WindowInstance,
		target: WindowTarget,
	): Promise<void> {
		if (!win || win.winId === ROOT_WIN_ID) {
			return;
		}
		if (!win.componentKey) {
			console.error(
				`[WindowManager] Fönstret "${win.title}" saknar en 'componentKey' och kan inte frikopplas.`,
			);
			return;
		}

		console.log("componentKey", win.componentKey);

		const descriptor = {
			winId: win.winId,
			title: win.title,
			componentKey: win.componentKey,
			payload: $state.snapshot(win.payload),
			props: $state.snapshot(win.props),
			context: {
				type: target === "tab" ? "browser-tab" : "tauri-window",
			} as WindowContext,

			width: win.state.width,
			height: win.state.height,
			left: win.state.left,
			top: win.state.top,
		};

		try {
			win.isDetached = true;
			await this.backend.open(descriptor, target);

			// this.closeWin(win);
			// Ändra först när backend.open lyckats.
			win.context = descriptor.context;
			// 🟢 NYTT: Starta en lyssnare i huvudappen som tar emot flikens ändringar!
			this.setupStandaloneSync(win.winId);
			this.backend.send(win.winId, {
				payload: $state.snapshot(win.payload),
				props: $state.snapshot(win.props),
			});

			// if (win.payload) {
			//   const currentPayload = $state.snapshot(win.payload);
			//   const cleanPayload = Object.fromEntries(
			//     Object.entries(currentPayload ?? {}).filter(([, val]) =>
			//       typeof val !== "function"
			//     ),
			//   );
			//   // this.backend.send(win.winId, cleanPayload);
			//   this.backend.send(win.winId, {
			//     payload: cleanPayload,
			//     props: $state.snapshot(win.props),
			//   });
			// }
		} catch (error) {
			console.error(
				"[WindowManager] Misslyckades att frikoppla fönster:",
				error,
			);
		}
	}

	/**
	 * Stänger ett frikopplat fönster.
	 */
	async closeDetached(id: WindowId): Promise<boolean> {
		try {
			await this.backend.close(id);
			return true;
		} catch (error) {
			console.error(
				`[WindowManager] Kunde inte stänga externt fönster ${id}:`,
				error,
			);
			return false;
		}
	}

	closeWin(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		// Skapa ett Set med ID:t för fönstret vi vill stänga samt alla dess underfönster
		const ids = new Set([
			win.winId,
			...this.getDescendants(win.winId).map((w) => w.winId),
		]);

		// Filtrera bort alla dessa fönster från den reaktiva arrayen i en enda stöt
		this.windows = this.windows.filter((w) => !ids.has(w.winId));
	}

	setThumbnail(id: WindowId, thumbnail: string | null): void {
		const win = this.find(id);
		if (win) {
			win.thumbnail = thumbnail;
		}
	}
}

const [getContextManager, setContextManager] = createContext<WindowManager>();

export interface WindowManagerOptions {
	modules?: Record<string, () => Promise<any>>;
	backend?: WindowBackend;
}

export function initializeWindowManager(
	options?: WindowManagerOptions,
): WindowManager {
	try {
		return getContextManager();
	} catch {
		const manager = new WindowManager(
			options?.backend,
			// options?.modules,
		);

		setContextManager(manager);
		return manager;
	}
}

export function getWindowManager(): WindowManager {
	return getContextManager();
}
