// windowManager.svelte.ts

// WindowManager
// ├─ windows
// ├─ open
// ├─ close
// ├─ focus
// ├─ reparent
// ├─ hierarchy
// ├─ z-order
// └─ viewport assignment

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

// Workspace Host
//  ├─ Window A
//  ├─ Window B
//  └─ DetachedHost #1
//       ├─ Window C
//       ├─ Window C1
//       └─ Window C2

import { type Component, createContext } from "svelte";
import { getComponentKey } from "./windowRegistry.ts";

import { WindowSync } from "./windowSync.svelte.ts";

import {
	createWindowBackend,
	type DetachedWindowState,
	type ExternalWindowDescriptor,
	type WindowBackend,
	type WindowTarget,
} from "./windowBackend.ts";

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
export type RenderStrategy =
	| "immediate"
	| "latest-wins"
	| "throttled"
	| "manual";

export interface WindowMetrics {
	renderMs: number;
	renderBusy: false;
	renderStrategy: RenderStrategy;
}

export interface WindowState extends WindowRect {
	isMinimized: boolean;
	isMaximized: boolean;
	transparency: number;
	isFocused: boolean;
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

// type WindowViewPortType =
// 	| "workspace"
// 	| "browser-tab"
// 	| "browser-window"
// 	| "tauri-window";

import { type WindowViewPortType } from "./windowBackend.ts";

interface WindowViewPort {
	id: string; // unique identifier for the viewPort instance (e.g., tab ID, window ID)
	type: WindowViewPortType;
}

export interface WindowInstance<TPayload = unknown> {
	winId: WindowId;
	title: string;
	thumbnail: string | null;
	component: Component<any>;
	componentKey: string; // component as string, needed for browsertab and tauri backend
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
	// isDetached: boolean;
	viewPort: WindowViewPort;
	// context: WindowContext;
	metrics: WindowMetrics;
}

export interface OpenWindowOptions<TPayload = unknown> {
	winId?: WindowId;
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

const CALLBACK_PREFIX = "__callback_proxy_id__::";

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

// Uppdatera globala register (längst upp i windowManager.svelte.ts)
if (typeof globalThis !== "undefined") {
	// Sparar nu: callbackId -> fungerande JavaScript-funktion
	if (!(globalThis as any).__callbackRegistry) (globalThis as any).__callbackRegistry = new Map();
	// Sparar nu: winId -> Set med tillhörande callbackId:n (för enkel städning)
	if (!(globalThis as any).__windowCallbackMapping) (globalThis as any).__windowCallbackMapping = new Map();
	if (!(globalThis as any).__replyHandlers) (globalThis as any).__replyHandlers = new Map();
}

/**
 * Förvandlar funktioner till sträng-ID:n och mappar dem till fönstrets ID
 */

export class WindowManager {
	windows = $state<WindowInstance[]>([]);

	private zCounter = 1;

	// private readonly backend: WindowBackend;
	private readonly backend: WindowBackend;
	private readonly sync: WindowSync;

	constructor(options: WindowManagerOptions = {}) {
		this.backend = options.backend ?? createWindowBackend();
		this.sync = new WindowSync(this.backend);

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
			showButtons: false,
			docking: {},
			payload: null,
			viewPort: { id: "", type: "workspace" },

			// isDetached: false,

			metrics: {
				renderMs: 0,
				renderStrategy: "immediate",
				renderBusy: false,
			},
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

	getRenderableRoots(
		runtimeType: WindowViewPortType,
	) {
		return this.getChildren(ROOT_WIN_ID)
			.filter(
				(w) => w.viewPort.type === runtimeType,
			);
	}

	getRenderableChildren(
		parentId: WindowId,
		viewPortType: WindowViewPort["type"],
	): WindowInstance[] {
		return this.getChildren(parentId).filter(
			(win) =>
				!win.state.isMinimized &&
				win.viewPort.type === viewPortType,
		);
	}

	/**
	 * Frikopplar ett fönster till browser-tab,
	 * browser-popup eller Tauri.
	 */

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
		if (options.winId) {
			const existing = this.find(options.winId);
			if (existing) return existing as WindowInstance<TPayload>;
		}

		// const requestedParent = options.parentId ?? ROOT_WIN_ID;
		// const parent = this.find(requestedParent);
		// const parentId = parent ? parent.winId : ROOT_WIN_ID;

		const parent = this.find(options.parentId ?? ROOT_WIN_ID) ?? this.find(ROOT_WIN_ID)!;
		const parentId = parent.winId;

		const tileOffset = options.tileOffset ?? 20;
		const siblingCount = this.getChildren(parentId).length;
		// const offset = options.noTile ? 0 : siblingCount * 20;

		const currentOffset = siblingCount * tileOffset;
		const compKey = options.componentKey ?? getComponentKey(component);

		// console.log("[open] component.name", component.name);
		// console.log("[open] componentKey", compKey);

		const geometry = this.fitToParent(parent, {
			left: options.left ?? currentOffset,
			top: options.top ?? currentOffset,
			width: options.width ?? 400,
			height: options.height ?? 300,
		});

		const win = $state<WindowInstance<TPayload>>({
			winId: options.winId ?? crypto.randomUUID(),

			title: options.title ?? component.name ?? "Window",
			thumbnail: null,
			component,
			componentKey: compKey, //options.componentKey,
			props: options.props ?? {},
			parentId,
			boundingEl: options.boundingEl ?? null,
			state: {
				left: geometry.left,
				top: geometry.top,
				width: geometry.width,
				height: geometry.height,

				isMinimized: false,
				isMaximized: false,
				transparency: options.transparency ?? 1,
			},

			metrics: {
				renderMs: 0,
				renderStrategy: "immediate",
				renderBusy: false,
			},

			storedState: null,
			zIndex: ++this.zCounter,
			tileOffset,
			showButtons: options.showButtons ?? true,
			docking: options.docking ?? {},
			payload: (options.payload ?? null) as TPayload,
			// payload: options.payload ? $state(options.payload) : (null as any),
			titlebar: options.titlebar,
			// isDetached: false,

			viewPort: {
				id: crypto.randomUUID(),
				type: "workspace",
			},
			// context: { type: "workspace" },
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

	private fitToParent(
		parent: WindowInstance,
		rect: Partial<WindowRect>,
	): WindowRect {
		const bounds = parent.boundingEl;

		const parentWidth = bounds?.clientWidth ?? parent.state.width;
		const parentHeight = bounds?.clientHeight ?? parent.state.height;

		const width = Math.min(rect.width ?? 400, parentWidth);
		const height = Math.min(rect.height ?? 300, parentHeight);

		const left = Math.max(0, Math.min(rect.left ?? 0, parentWidth - width));
		const top = Math.max(0, Math.min(rect.top ?? 0, parentHeight - height));

		return { left, top, width, height };
	}

	reparent(
		id: WindowId,
		newParentId: WindowId,
		screenRect: WindowRect,
	): boolean {
		const win = this.find(id);

		const parent = this.find(newParentId) ??
			this.find(ROOT_WIN_ID);

		if (!win || !parent) {
			return false;
		}

		if (id === ROOT_WIN_ID) {
			return false;
		}

		if (id === newParentId || this.getDescendants(id).some((x) => x.winId === newParentId)) {
			return false;
		}

		const bounds = parent.boundingEl;

		if (!bounds) {
			return false;
		}

		const parentRect = bounds.getBoundingClientRect();

		const localRect = {
			left: screenRect.left - parentRect.left + bounds.scrollLeft,
			top: screenRect.top - parentRect.top + bounds.scrollTop,

			width: screenRect.width,
			height: screenRect.height,
		};

		const geometry = this.fitToParent(parent, localRect);

		win.parentId = parent.winId;
		win.boundingEl = null;

		Object.assign(win.state, geometry, { isMaximized: false });

		win.docking = {};
		win.storedState = null;

		this.focus(win);

		return true;
	}

	updateState(id: WindowId, updates: Partial<WindowState>): void {
		const win = this.find(id);
		if (!win || win.winId === ROOT_WIN_ID) {
			if (win?.winId === ROOT_WIN_ID) {
				Object.assign(win.state, updates);
			}
			return;
		}

		Object.assign(win.state, updates);
	}

	updateMetrics(win: WindowInstance, updates: Partial<WindowMetrics>): void {
		if (win.winId === ROOT_WIN_ID) return;
		Object.assign(win.metrics, updates);
	}

	updatePayload<TPayload>(id: WindowId, payload: TPayload): void {
		const win = this.find(id);
		if (!win) return;

		// 🟢 Skydd mot eviga loopar: Jämför strängifierad data
		console.time("updatePayload");
		const oldPayloadStr = JSON.stringify($state.snapshot(win.payload));
		const newPayloadStr = JSON.stringify(payload);
		console.timeEnd("updatePayload");

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

	/**
	 * Updates props on a window.
	 *
	 * If `id` is provided, only that window is updated.
	 *
	 * If `id` is omitted, all windows containing the specified
	 * prop key(s) are updated.
	 *
	 * Example:
	 *
	 * 	updateProps({ text: "Hello" }, winId);
	 *
	 * 	updateProps({ theme: "dark" });
	 *
	 * For shared reactive data, use `payload` instead of props.
	 */
	// updateProps(
	// 	props: Record<string, unknown>,
	// 	id?: WindowId,
	// ): void {
	// 	if (id) {
	// 		const win = this.find(id);
	// 		if (!win) return;
	// 		Object.assign(win.props, props);
	// 		return;
	// 	}
	// 	for (const win of this.windows) {
	// 		for (const key of Object.keys(props)) {
	// 			if (key in win.props) {
	// 				win.props[key] = props[key];
	// 			}
	// 		}
	// 	}
	// }

	updateProps(
		props: Record<string, unknown>,
		win: WindowInstance,
	): void {
		if (!win) return;
		const key = getComponentKey(win.component);
		for (const w of this.windows) {
			if (getComponentKey(w.component) === key) {
				Object.assign(w.props, props);
			}
		}
	}

	updatePropsByKey(key: string, props: Record<string, unknown>): void {
		for (const win of this.windows) {
			if (getComponentKey(win.component) === key) {
				Object.assign(win.props, props);
			}
		}
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
		if (win.winId !== ROOT_WIN_ID) {
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
	resizeDockedWindow(win: WindowInstance, mode: ResizeMode | string, proposed: Partial<WindowRect>): void {
		if (win.winId === ROOT_WIN_ID) return;

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

					// 🌟 Skriv direkt till grannens reaktiva tillstånd istället för this.updateState
					other.state.width = b.width + allowed;
				} else if (
					mode.includes("right") &&
					Math.abs(b.left - (old.left + old.width)) <= EPSILON
				) {
					const delta = next.left + next.width - (old.left + old.width);
					const allowed = Math.min(delta, b.width - MIN_WIDTH);
					next.width = old.width + allowed;

					// 🌟 Ingen updateState behövs, tilldela fälten direkt
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

	// Inuti setupStandaloneSync(winId: WindowId) i windowManager.svelte.ts
	private setupStandaloneSync(winId: string): void {
		this.sync.start(
			winId,
			() => {
				const win = this.find(winId);

				if (!win) {
					return {
						payload: undefined,
						props: {},
					};
				}

				return {
					payload: win.payload,
					props: win.props ?? {},
				};
			},
			(state: DetachedWindowState) => {
				const win = this.find(winId);

				if (!win) return;

				this.updatePayload(winId, state.payload);
				this.updateProps(winId, state.props ?? {});
			},
		);
	}
	/**
	 * Startar dubbelriktad payload-synk för ett specifikt frikopplat fönster.
	 * Används både av huvudappen vid sömlös MDI-reparenting och av standalone-flikar.
	 */

	async detachWindow(
		win: WindowInstance,
		target: WindowTarget,
	): Promise<void> {
		// const win = this.find(winId);

		if (!win) {
			throw new Error(`Window ${win} hittades inte.`);
		}
		// const componentKey = win.componentKey;
		const descriptor: ExternalWindowDescriptor = {
			winId: win.winId,
			title: win.title,
			componentKey: win.componentKey, //: getComponentKey(win.component), //   win.componentKey,
			payload: win.payload,
			props: win.props ?? {},
			width: win.state?.width,
			height: win.state?.height,
			left: win.state?.left,
			top: win.state?.top,
		};

		await this.sync.open(descriptor, target);

		win.viewPort = {
			id: win.winId,
			type: target === "tab" ? "browser-tab" : target === "window" ? "browser-window" : "tauri-window",
		};

		// this.setupStandaloneSync(win.winId);
	}
	/**
	 * Stänger ett frikopplat fönster.
	 */
	async closeDetached(id: WindowId): Promise<boolean> {
		return this.sync.closeDetached(id);
	}

	closeWin(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		const ids = new Set([
			win.winId,
			...this.getDescendants(win.winId).map((child) => child.winId),
		]);

		// Stoppa synk och stäng externa fönster.
		for (const id of ids) {
			const child = this.find(id);

			this.sync.stop(id);

			if (child && child.viewPort.type !== "workspace") {
				void this.backend.close(id);
			}
		}

		this.windows = this.windows.filter(
			(item) => !ids.has(item.winId),
		);
	}

	// windowManager.svelte.ts
	setBoundingEl(id: WindowId, el: HTMLElement | null): void {
		const win = this.find(id);
		if (win && win.boundingEl !== el) {
			win.boundingEl = el;
		}
	}

	setThumbnail(win: WindowInstance, thumbnail: string | null): void {
		win.thumbnail = thumbnail;
	}
}

const [getContextManager, setContextManager] = createContext<WindowManager>();

export interface WindowManagerOptions {
	modules?: Record<string, () => Promise<any>>;
	backend?: WindowBackend;
}

// export function initializeWindowManager(
// 	options?: WindowManagerOptions,
// ): WindowManager {
// 	try {
// 		return getContextManager();
// 	} catch {
// 		const manager = new WindowManager(
// 			options?.backend,
// 			// options?.modules,
// 		);
// 		setContextManager(manager);
// 		return manager;
// 	}
// }

import { registerComponents } from "./windowRegistry";

export function initializeWindowManager(
	options?: WindowManagerOptions,
): WindowManager {
	try {
		return getContextManager();
	} catch {
		const manager = new WindowManager(
			options?.backend,
		);

		if (options?.modules) {
			registerComponents(options.modules);
		}

		setContextManager(manager);
		return manager;
	}
}

export function getWindowManager(): WindowManager {
	return getContextManager();
}
