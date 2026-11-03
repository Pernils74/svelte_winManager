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

import { type WindowViewPortType } from "./windowBackend.ts";

interface WindowViewPort {
	id: string; // unique identifier for the viewPort instance (e.g., tab ID, window ID)
	type: WindowViewPortType;
}

export interface WindowInstance<TPayload = unknown> {
	winId: WindowId;
	title: string;
	thumbnail: string | null;
	component: Component<any> | null;
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
	payload: TPayload | null;
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
	public readonly sync: WindowSync;

	constructor(options: WindowManagerOptions = {}) {
		this.backend = options.backend ?? createWindowBackend();
		this.sync = new WindowSync(this.backend);

		this.windows.push({
			winId: ROOT_WIN_ID,
			title: "Root Workspace",
			thumbnail: null,
			component: null,
			componentKey: "",
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
				isFocused: false,
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
				(w) =>
					!w.state.isMinimized &&
					w.viewPort.type === runtimeType,
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

	// src/lib/windowManager.svelte.ts

	/**
	 * Hämtar alla fönster som har en förälder, men där föräldern INTE
	 * befinner sig i det lokala skrivbordet (workspace).
	 */
	getOrphanWorkspaceWindows(): WindowInstance[] {
		return this.windows.filter((win) => {
			// 1. Hoppa över rooten och fönster som inte ska renderas i workspace överhuvudtaget
			if (win.winId === ROOT_WIN_ID || win.state.isMinimized || win.viewPort.type !== "workspace") {
				return false;
			}

			// 2. Om fönstret inte har en förälder (eller är kopplat till root), är det inget orphan-fönster
			if (!win.parentId || win.parentId === ROOT_WIN_ID) {
				return false;
			}

			// 3. Leta efter föräldern i registret
			const parent = this.find(win.parentId);

			// 4. Om föräldern saknas HELT, eller om föräldern har flyttats ut till en extern flik/vy:
			// Då är detta fönster föräldralöst på det lokala skrivbordet!
			return !parent || parent.viewPort.type !== "workspace";
		});
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
		if (options.winId) {
			const existing = this.find(options.winId);
			if (existing) return existing as WindowInstance<TPayload>;
		}

		const parent = this.find(options.parentId ?? ROOT_WIN_ID) ?? this.find(ROOT_WIN_ID)!;
		const parentId = parent.winId;

		const tileOffset = options.tileOffset ?? 20;
		const siblingCount = this.getChildren(parentId).length;

		const currentOffset = siblingCount * tileOffset;
		const compKey = options.componentKey ?? getComponentKey(component);

		if (!compKey) {
			throw new Error(
				`Komponenten "${
					component.name ?? "unknown"
				}" är inte registrerad. Ange componentKey eller registrera komponenten först.`,
			);
		}

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
				isFocused: false,
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
			payload: options.payload ?? null,
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
		// 🟢 STARTA SYNK DIREKT VID FÖDELSELN:
		// Detta sätter upp BroadcastChannel-lyssnaren i bakgrunden direkt,
		// oavsett om fönstret renderas på skärmen eller inte!
		// this.setupStandaloneSync(win.winId);

		return win;
	}

	duplicateWindow(
		source: WindowInstance,
		offset = 24,
		parentId?: WindowId,
	): WindowInstance | undefined {
		if (
			source.winId === ROOT_WIN_ID ||
			!source.component
		) {
			return undefined;
		}

		const copy = this.open(source.component, {
			title: `${source.title} (copy)`,
			parentId: parentId ?? source.parentId,
			componentKey: source.componentKey,
			props: { ...source.props },
			payload: structuredClone(
				$state.snapshot(source.payload),
			),

			left: source.state.left + offset,
			top: source.state.top + offset,
			width: source.state.width,
			height: source.state.height,
			transparency: source.state.transparency,
			showButtons: source.showButtons,
			titlebar: source.titlebar,
		});

		for (const child of this.getChildren(source.winId)) {
			this.duplicateWindow(
				child,
				0,
				copy.winId,
			);
		}

		return copy;
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

	/**
	 * Kollar om ett fönster ELLER någon av dess föräldrar i rakt uppstigande led är detached.
	 */
	isWindowOrParentDetached(id: WindowId): boolean {
		const win = this.find(id);
		if (!win || win.winId === ROOT_WIN_ID) return false;

		// 1. Om fönstret självt är utflyttat, returnera true
		if (win.viewPort.type !== "workspace") return true;

		// 2. Om fönstret har en förälder, kolla förälderns status rekursivt
		if (win.parentId && win.parentId !== ROOT_WIN_ID) {
			return this.isWindowOrParentDetached(win.parentId);
		}

		return false;
	}

	updatePayload<TPayload>(id: WindowId, payload: TPayload): void {
		const win = this.find(id);
		console.log("Updating payload for window: ");
		if (!win) return;

		// 1. Mutera det reaktiva objektet lokalt i minnet
		if (win.payload !== payload) {
			if (
				win.payload && typeof win.payload === "object" &&
				typeof payload === "object"
			) {
				Object.assign(win.payload, payload);
			} else {
				win.payload = payload;
			}
		}

		// 🟢 2. SÄKRA RPC-KANALEN: Om fönstret inte är ett rent internt workspace-fönster,
		// skjut ut ändringen på kanalen direkt. Detta lagar "detach parent till detached child"
		// och alla andra kombinationer oavsett om svelte har avregistrerat DOM-trädet!
		if (win.viewPort.type !== "workspace") {
			console.log(`🚀 [RPC Transport] Tvingar synk för fönster ${id} (${win.title})`);

			void this.sync.send(id, {
				payload: $state.snapshot(win.payload),
				props: $state.snapshot(win.props ?? {}),
			}).catch((err) => console.error("[WindowManager] RPC-synk misslyckades:", err));
		}
	}

	updatePayload_old<TPayload>(id: WindowId, payload: TPayload): void {
		const win = this.find(id);
		console.log("hittades win ?", win);
		if (!win) return;

		// 🟢 Skydd mot eviga loopar: Jämför strängifierad data
		console.time("updatePayload");
		const oldPayloadStr = JSON.stringify($state.snapshot(win.payload));
		const newPayloadStr = JSON.stringify(payload);
		console.timeEnd("updatePayload");

		console.log("[WindowManager] Kollar om det skall uppdateras:");
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

			// 🟢 Tvinga ut ett nätverkspaket till BroadcastChannel DIREKT!
			// Det gör att alla fristående flikar omedelbart tar emot ändringen.
			// 	if (win.viewPort.type !== "workspace") {
			// 		void this.sync.send(id, {
			// 			payload: $state.snapshot(win.payload),
			// 			props: $state.snapshot(win.props ?? {}),
			// 		}).catch((err) => console.error("[WindowManager] Manuellt synkfel:", err));
			// 	}
			console.log("[WindowManager] Updated window:");
			void this.sync.send(id, {
				payload: $state.snapshot(win.payload),
				props: $state.snapshot(win.props ?? {}),
			}).catch;
		}
	}

	/**
	 * Updates props on a window.
	 *
	 * If `win` is provided, only that window is updated.
	 *
	 * Otherwise, all windows already containing at least one of the
	 * specified prop keys are updated.
	 *
	 * Example:
	 *
	 * 	updateProps({ text: "Hello" }, win);
	 *
	 * 	updateProps({ theme: "dark" });
	 *
	 * For shared reactive data, use `payload` instead of props.
	 */
	updateProps(
		props: Record<string, unknown>,
		win?: WindowInstance,
	): void {
		if (win) {
			Object.assign(win.props, props);
			return;
		}

		const keys = Object.keys(props);
		for (const w of this.windows) {
			if (keys.some((key) => key in w.props)) {
				Object.assign(w.props, props);
			}
		}

		// Lägg till detta i slutet av din updateProps-metod om fönstret är detached:
		// if (win && win.viewPort.type !== "workspace") {
		// 	void this.sync.send(win.winId, {
		// 		payload: $state.snapshot(win.payload),
		// 		props: $state.snapshot(win.props ?? {}),
		// 	});
		// }
	}

	updatePropsByKey(key: string, props: Record<string, unknown>): void {
		for (const win of this.windows) {
			if (win.componentKey === key) {
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
		this.publishDetachedStateUpdate(win, {
			isMinimized: true,
		});
	}

	restore(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;
		if (win.storedState) Object.assign(win.state, win.storedState);
		win.state.isMinimized = false;
		win.state.isFocused = true;
		this.focus(win); // Skicka vidare objektet till nästa metod
		this.publishDetachedStateUpdate(win, {
			...(win.storedState ?? {}),
			isMinimized: false,
			isFocused: true,
		});
	}

	private publishDetachedStateUpdate(
		win: WindowInstance,
		updates: Partial<WindowState>,
	): void {
		if (win.viewPort.type === "workspace") return;

		void this.sendWindowStateUpdate(win.winId, updates).catch(
			(error) => {
				console.error(
					`[WindowManager] Kunde inte synka state för ${win.winId}:`,
					error,
				);
			},
		);
	}

	async sendWindowStateUpdate(
		winId: WindowId,
		updates: Partial<WindowState>,
	): Promise<void> {
		await this.sync.sendStateUpdate(winId, updates);
	}

	/**
	 * Resizes a window while proportionally expanding or shrinking adjacent docked sibling windows.
	 */
	resizeDockedWindow(win: WindowInstance, mode: ResizeMode, proposed: Partial<WindowRect>): void {
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

	// src/lib/windowManager.svelte.ts

	// src/lib/windowManager.svelte.ts

	// setupStandaloneSync(winId: WindowId): () => void {
	// 	// när vi nu sätter upp sync redan i WindowManager.open
	// 	this.sync.start(
	// 		winId,
	// 		() => {
	// 			const win = this.find(winId);
	// 			if (!win) return { payload: null, props: {} };

	// 			// Leta upp föräldern i hierarkin för att kunna kontrollera dess viewport
	// 			const parent = win.parentId ? this.find(win.parentId) : null;

	// 			// 🟢 DIN LOGIK: Kontrollera om fönstret självt ELLER dess förälder är detached
	// 			const isSelfDetached = win.viewPort.type !== "workspace";
	// 			const isParentDetached = parent ? parent.viewPort.type !== "workspace" : false;

	// 			console.log("Detected detached state: Self: ${isSelf");
	// 			// Om vi ska skicka (någon av oss är detached), returnera de levande runorna
	// 			// så att WindowSyncs $effect kan spåra dem automatiskt i bakgrunden! [1.21]
	// 			if (isSelfDetached || isParentDetached) {
	// 				return {
	// 					payload: win.payload,
	// 					props: win.props ?? {},
	// 				};
	// 			}

	// 			// Annars returnerar vi bara en statisk tom struktur så att ingen nätverkstrafik skickas i onödan
	// 			return { payload: null, props: {} };
	// 		},
	// 		(state: DetachedWindowState) => {
	// 			const win = this.find(winId);
	// 			if (!win) return;

	// 			// Ta emot och uppdatera lokalt tillstånd reaktivt
	// 			this.updatePayload(winId, state.payload);
	// 			this.updateProps(state.props ?? {}, win);
	// 		},
	// 		(updates) => {
	// 			this.updateState(winId, updates);
	// 		},
	// 	);

	// 	return () => this.sync.stop(winId);
	// }

	setupStandaloneSync(winId: WindowId): () => void {
		this.sync.start(
			winId,
			() => {
				const win = this.find(winId);
				console.log("win ");

				if (!win) return { payload: null, props: {} };

				// 自由 1. Genom att köra $state.snapshot() inuti denna funktion
				// tvingar vi Svelte 5 att läsa av ALLA reaktiva proxies djupt.
				// Detta gör att effekten vaknar så fort något inuti payload eller props muteras!
				// return {
				// 	payload: win.payload,
				// 	props: win.props ?? {},
				// };

				return {
					payload: win.payload ? $state.snapshot(win.payload) : null,
					props: win.props ? $state.snapshot(win.props) : {},
				};

				// return {
				// 	payload: $state.snapshot(win.payload),
				// 	props: $state.snapshot(win.props ?? {}),
				// };
			},
			(state: DetachedWindowState) => {
				console.log("detached ");

				const win = this.find(winId);
				if (!win) return;

				// 🟢 Om du har serialize/deserialize-funktioner från din gamla kod,
				// kör dem här i mottagaren:
				// const processedProps = deserializePropsWithFunctions(state.props, winId, this);
				// this.updateProps(processedProps, winId);
				this.updatePayload(winId, state.payload);
				this.updateProps(state.props ?? {}, win);
			},
			(updates) => {
				this.updateState(winId, updates);
			},
		);

		return () => this.sync.stop(winId);
		// 🟢 Om du vill behålla din gamla städning för fönster-callbacks:
		// cleanupWindowCallbacks(winId);
	}

	/**
	 * Startar dubbelriktad payload-synk för ett specifikt frikopplat fönster.
	 * Används både av huvudappen vid sömlös MDI-reparenting och av standalone-flikar.
	 */

	async detachWindow(
		win: WindowInstance,
		target: Exclude<WindowViewPortType, "workspace">,
	): Promise<void> {
		if (!win) {
			throw new Error(`Window ${win} hittades inte.`);
		}

		// 🟢 RÄDDA BARNEN: Om det här fönstret har barn som fortfarande är kvar i "workspace",
		// flytta upp dem till skrivbordsroten så de inte försvinner i tomma intet!
		const children = this.getChildren(win.winId);
		for (const child of children) {
			if (child.viewPort.type === "workspace") {
				// Hämta skärmpositionen så de inte hoppar till konstiga ställen vid reparenting
				const bounds = child.boundingEl?.getBoundingClientRect() ?? { left: 100, top: 100, width: 400, height: 300 };

				this.reparent(child.winId, ROOT_WIN_ID, {
					left: child.state.left + win.state.left, // Gör om till absoluta koordinater på rooten
					top: child.state.top + win.state.top,
					width: child.state.width,
					height: child.state.height,
				});
			}
		}

		const descriptor: ExternalWindowDescriptor = {
			winId: win.winId,
			title: win.title,
			componentKey: win.componentKey,
			parentId: win.parentId,
			payload: $state.snapshot(win.payload),
			props: $state.snapshot(win.props ?? {}),
			width: win.state?.width,
			height: win.state?.height,
			left: win.state?.left,
			top: win.state?.top,
		};

		// Öppna först. Om detta misslyckas ändras inte viewport.
		await this.sync.open(descriptor, target);

		win.viewPort = {
			id: win.winId,
			type: target, //=== "tab" ? "browser-tab" : target === "window" ? "browser-window" : "tauri-window",
		};

		// Starta dubbelriktad state-synk.
		this.setupStandaloneSync(win.winId);
	}

	/**
	 * Stänger ett frikopplat fönster.
	 */
	async closeDetached(id: WindowId): Promise<void> {
		const win = this.find(id);
		if (!win || win.viewPort.type === "workspace") return;

		this.closeWin(win);
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
				void this.backend.close(id).catch((error) => {
					console.error(
						`[WindowManager] Kunde inte stänga fönster ${id}:`,
						error,
					);
				});
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
		const manager = new WindowManager({
			backend: options?.backend,
		});

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
