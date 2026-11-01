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

const CALLBACK_PREFIX = "__callback_proxy_id__::";

/**
 * Förvandlar funktioner till sträng-ID:n och mappar dem till fönstrets ID
 */
function serializePropsWithFunctions(props: Record<string, any>, winId: string): Record<string, any> {
	const serialized: Record<string, any> = {};
	const registry = (globalThis as any).__callbackRegistry;
	const mapping = (globalThis as any).__windowCallbackMapping;

	// Säkerställ att fönstret har en mängd (Set) i mappningen
	if (!mapping.has(winId)) {
		mapping.set(winId, new Set<string>());
	}
	const windowCallbacks = mapping.get(winId);

	for (const [key, value] of Object.entries(props)) {
		if (typeof value === "function") {
			const id = CALLBACK_PREFIX + crypto.randomUUID();

			// Spara funktionen och koppla den till fönstret för framtida städning
			registry.set(id, value);
			windowCallbacks.add(id);

			serialized[key] = id;
		} else if (value && typeof value === "object" && !Array.isArray(value)) {
			serialized[key] = serializePropsWithFunctions(value, winId);
		} else {
			serialized[key] = value;
		}
	}
	return serialized;
}

/**
 * Funktion för att städa bort alla callbacks kopplade till ett specifikt fönster
 */
export function cleanupWindowCallbacks(winId: string): void {
	const registry = (globalThis as any).__callbackRegistry;
	const mapping = (globalThis as any).__windowCallbackMapping;

	if (mapping.has(winId)) {
		const callbackIds = mapping.get(winId);
		for (const id of callbackIds) {
			registry.delete(id); // Ta bort själva funktionsreferensen så GC kan rensa den!
		}
		mapping.delete(winId); // Ta bort fönstret ur mappningen
		console.log(`[CallbackRegistry] Ransade alla callbacks för fönster: ${winId}`);
	}
}

/**
 * Förvandlar sträng-ID:n tillbaka till exekverbara funktioner (Körs i Frikopplat fönster)
 */
function deserializePropsWithFunctions(
	props: Record<string, any>,
	winId: string,
	manager: WindowManager,
): Record<string, any> {
	const deserialized: Record<string, any> = {};

	for (const [key, value] of Object.entries(props)) {
		if (typeof value === "string" && value.startsWith(CALLBACK_PREFIX)) {
			// Skapa en proxy-funktion som skickar RPC bakåt till huvudfönstret
			deserialized[key] = (...args: any[]) => {
				return new Promise((resolve, reject) => {
					const replyId = crypto.randomUUID();
					(globalThis as any).__replyHandlers.set(replyId, { resolve, reject });

					// Skicka anropet via backend till Host
					manager.backend.send(winId, {
						// Vi skickar en special-payload eller använder backend-direkt
						// för enkelhetens skull postar vi via backend-metoden vi modifierade
					} as any);

					// Eftersom din backend har postBrowserMessage, kan vi trigga det enkelt:
					(manager.backend as any).postBrowserMessage({
						winId,
						type: "callback:invoke",
						callbackId: value,
						args,
						replyId,
					});
				});
			};
		} else if (value && typeof value === "object" && !Array.isArray(value)) {
			deserialized[key] = deserializePropsWithFunctions(value, winId, manager);
		} else {
			deserialized[key] = value;
		}
	}
	return deserialized;
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
			left: number;
			top: number;
			width: number;
			height: number;
		},
	): boolean {
		const DEBUG = true;
		const TAG = `[REPARENT ${id} → ${newParentId}]`;

		const log = (...args: unknown[]) => {
			if (DEBUG) console.log(TAG, ...args);
		};

		const group = (label: string) => {
			if (DEBUG) console.group(`${TAG} ${label}`);
		};

		const endGroup = () => {
			if (DEBUG) console.groupEnd();
		};

		const round = (n: number) => Number.isFinite(n) ? Number(n.toFixed(2)) : n;

		group("START");

		log("ARGUMENTS", {
			id,
			newParentId,
			screenRect,
		});

		// --------------------------------------------------
		// 1. Find windows
		// --------------------------------------------------

		const win = this.find(id);
		const newParent = this.find(newParentId);

		if (!win) {
			log("ERROR: Window not found");
			endGroup();
			return false;
		}

		if (id === ROOT_WIN_ID) {
			log("ERROR: Cannot reparent root window");
			endGroup();
			return false;
		}

		if (!newParent) {
			log("ERROR: New parent not found");
			endGroup();
			return false;
		}

		// --------------------------------------------------
		// 2. Prevent cyclic relationships
		// --------------------------------------------------

		if (
			id === newParentId ||
			this.getDescendants(id).some(
				(child) => child.winId === newParentId,
			)
		) {
			log("ERROR: Cyclic relationship");
			endGroup();
			return false;
		}

		log("CYCLE VALIDATION OK");

		// --------------------------------------------------
		// 3. Validate screenRect and parent bounds
		// --------------------------------------------------

		const parentBounds = newParent.boundingEl;

		if (!parentBounds || !screenRect) {
			log("ERROR: Missing parent bounds or screenRect", {
				parentBounds,
				screenRect,
			});

			endGroup();
			return false;
		}

		const parentRect = parentBounds.getBoundingClientRect();

		const parentWidth = parentBounds.clientWidth;
		const parentHeight = parentBounds.clientHeight;

		if (
			parentWidth <= 0 ||
			parentHeight <= 0 ||
			parentBounds.offsetWidth <= 0 ||
			parentBounds.offsetHeight <= 0
		) {
			log("ERROR: Invalid parent dimensions");
			endGroup();
			return false;
		}

		// --------------------------------------------------
		// 4. Calculate parent CSS scale
		// --------------------------------------------------

		const scaleX = parentRect.width / parentBounds.offsetWidth;
		const scaleY = parentRect.height / parentBounds.offsetHeight;

		if (scaleX <= 0 || scaleY <= 0) {
			log("ERROR: Invalid CSS scale", {
				scaleX,
				scaleY,
			});

			endGroup();
			return false;
		}

		log("PARENT GEOMETRY", {
			screenRect: {
				left: round(parentRect.left),
				top: round(parentRect.top),
				width: round(parentRect.width),
				height: round(parentRect.height),
			},

			client: {
				width: parentWidth,
				height: parentHeight,
				left: parentBounds.clientLeft,
				top: parentBounds.clientTop,
			},

			offset: {
				width: parentBounds.offsetWidth,
				height: parentBounds.offsetHeight,
			},

			scroll: {
				left: parentBounds.scrollLeft,
				top: parentBounds.scrollTop,
			},

			scale: {
				x: round(scaleX, 4),
				y: round(scaleY, 4),
			},
		});

		// --------------------------------------------------
		// 5. Screen coordinates -> parent local coordinates
		// --------------------------------------------------

		const screenLeft = screenRect.left;
		const screenTop = screenRect.top;

		let left = (screenLeft - parentRect.left) / scaleX -
			parentBounds.clientLeft +
			parentBounds.scrollLeft;

		let top = (screenTop - parentRect.top) / scaleY -
			parentBounds.clientTop +
			parentBounds.scrollTop;

		log("COORDINATE CONVERSION", {
			screenLeft,
			screenTop,

			parentScreenLeft: round(parentRect.left),
			parentScreenTop: round(parentRect.top),

			scaleX: round(scaleX, 4),
			scaleY: round(scaleY, 4),

			clientLeft: parentBounds.clientLeft,
			clientTop: parentBounds.clientTop,

			scrollLeft: parentBounds.scrollLeft,
			scrollTop: parentBounds.scrollTop,

			localLeft: round(left),
			localTop: round(top),
		});

		// --------------------------------------------------
		// 6. Convert screen dimensions -> local dimensions
		// --------------------------------------------------

		const originalWidth = screenRect.width / scaleX;
		const originalHeight = screenRect.height / scaleY;

		log("ORIGINAL DIMENSIONS", {
			screenWidth: screenRect.width,
			screenHeight: screenRect.height,

			localWidth: round(originalWidth),
			localHeight: round(originalHeight),

			stateWidth: win.state.width,
			stateHeight: win.state.height,
		});

		if (originalWidth <= 0 || originalHeight <= 0) {
			log("ERROR: Invalid window dimensions");
			endGroup();
			return false;
		}

		// --------------------------------------------------
		// 7. Available space
		// --------------------------------------------------

		const availableWidth = Math.max(
			1,
			parentWidth - left,
		);

		const availableHeight = Math.max(
			1,
			parentHeight - top,
		);

		log("AVAILABLE SPACE", {
			parentWidth,
			parentHeight,

			left: round(left),
			top: round(top),

			availableWidth: round(availableWidth),
			availableHeight: round(availableHeight),
		});

		// --------------------------------------------------
		// 8. Calculate proportional scale
		// --------------------------------------------------

		const widthScale = availableWidth / originalWidth;
		const heightScale = availableHeight / originalHeight;

		const scale = Math.min(
			1,
			widthScale,
			heightScale,
		);

		const width = originalWidth * scale;
		const height = originalHeight * scale;

		log("SCALING", {
			widthScale: round(widthScale, 4),
			heightScale: round(heightScale, 4),

			selectedScale: round(scale, 4),

			originalWidth: round(originalWidth),
			originalHeight: round(originalHeight),

			finalWidth: round(width),
			finalHeight: round(height),
		});

		// --------------------------------------------------
		// 9. Clamp position inside parent
		// --------------------------------------------------

		const beforeClamp = {
			left,
			top,
		};

		left = Math.max(
			0,
			Math.min(left, parentWidth - width),
		);

		top = Math.max(
			0,
			Math.min(top, parentHeight - height),
		);

		log("POSITION CLAMP", {
			before: {
				left: round(beforeClamp.left),
				top: round(beforeClamp.top),
			},

			after: {
				left: round(left),
				top: round(top),
			},

			changed: beforeClamp.left !== left ||
				beforeClamp.top !== top,
		});

		// --------------------------------------------------
		// 9.5. Parent local -> workspace local
		// --------------------------------------------------

		const workspace = parentBounds.closest(
			".workspace",
		) as HTMLElement | null;

		if (!workspace) {
			log("ERROR: Workspace not found");
			endGroup();
			return false;
		}

		const workspaceRect = workspace.getBoundingClientRect();

		const workspaceScaleX = workspaceRect.width / workspace.offsetWidth;

		const workspaceScaleY = workspaceRect.height / workspace.offsetHeight;

		// Parent-local -> screen coordinates
		const finalScreenLeft = parentRect.left +
			(left + parentBounds.clientLeft - parentBounds.scrollLeft) *
				scaleX;

		const finalScreenTop = parentRect.top +
			(top + parentBounds.clientTop - parentBounds.scrollTop) *
				scaleY;

		// Screen coordinates -> workspace-local
		const workspaceLeft = (finalScreenLeft - workspaceRect.left) / workspaceScaleX -
			workspace.clientLeft +
			workspace.scrollLeft;

		const workspaceTop = (finalScreenTop - workspaceRect.top) / workspaceScaleY -
			workspace.clientTop +
			workspace.scrollTop;

		log("WORKSPACE COORDINATE CONVERSION", {
			parentLocal: {
				left: round(left),
				top: round(top),
			},

			finalScreen: {
				left: round(finalScreenLeft),
				top: round(finalScreenTop),
			},

			workspace: {
				left: round(workspaceLeft),
				top: round(workspaceTop),
			},

			workspaceScaleX,
			workspaceScaleY,
		});

		// --------------------------------------------------
		// 10. Final geometry
		// --------------------------------------------------

		const finalGeometry = {
			left: workspaceLeft,
			top: workspaceTop,
			width,
			height,
		};

		log("FINAL GEOMETRY", {
			parentLocal: {
				left: round(left),
				top: round(top),
			},

			workspaceLocal: {
				left: round(workspaceLeft),
				top: round(workspaceTop),
			},

			width: round(width),
			height: round(height),
		});

		// --------------------------------------------------
		// 11. Update window
		// --------------------------------------------------

		log("STATE BEFORE", {
			parentId: win.parentId,
			state: { ...win.state },
		});

		win.parentId = newParentId;
		win.boundingEl = null;

		Object.assign(win.state, {
			left,
			top,
			width,
			height,
			isMaximized: false,
		});

		win.docking = {};
		win.storedState = null;

		log("STATE AFTER", {
			parentId: win.parentId,
			state: { ...win.state },
		});

		// --------------------------------------------------
		// 12. Focus
		// --------------------------------------------------

		this.focus(win);

		log("REPARENT COMPLETE");
		log("RESULT", finalGeometry);

		endGroup();

		return true;
	}

	reparent_new(
		id: WindowId,
		newParentId: WindowId,
		screenRect?: {
			left: number;
			top: number;
			width: number;
			height: number;
		},
	): boolean {
		const win = this.find(id);
		const newParent = this.find(newParentId);

		if (!win || id === ROOT_WIN_ID || !newParent) return false;

		// Förhindra cykliska relationer.
		if (
			id === newParentId ||
			this.getDescendants(id).some((child) => child.winId === newParentId)
		) {
			return false;
		}

		const parentBounds = newParent.boundingEl;

		if (!parentBounds || !screenRect) {
			console.warn("[reparent] Missing parent bounds or screenRect");
			return false;
		}

		const parentRect = parentBounds.getBoundingClientRect();

		const parentWidth = parentBounds.clientWidth;
		const parentHeight = parentBounds.clientHeight;

		if (parentWidth <= 0 || parentHeight <= 0) return false;

		// 1. Konvertera skärmposition till nya parentens koordinatsystem.
		let left = screenRect.left -
			parentRect.left -
			parentBounds.clientLeft +
			parentBounds.scrollLeft;

		let top = screenRect.top -
			parentRect.top -
			parentBounds.clientTop +
			parentBounds.scrollTop;

		// 2. Ursprunglig storlek.
		const originalWidth = screenRect.width;
		const originalHeight = screenRect.height;

		// 3. Hur mycket utrymme finns kvar från släppositionen?
		const availableWidth = Math.max(1, parentWidth - left);
		const availableHeight = Math.max(1, parentHeight - top);

		// 4. Skala proportionellt endast om det behövs.
		const scale = Math.min(
			1,
			availableWidth / originalWidth,
			availableHeight / originalHeight,
		);

		const width = originalWidth * scale;
		const height = originalHeight * scale;

		// 5. Om fönstret hamnar utanför parenten, korrigera positionen.
		left = Math.max(0, Math.min(left, parentWidth - width));
		top = Math.max(0, Math.min(top, parentHeight - height));

		// 6. Uppdatera fönstret.
		win.parentId = newParentId;
		win.boundingEl = null;

		Object.assign(win.state, {
			left,
			top,
			width,
			height,
			isMaximized: false,
		});

		win.docking = {};
		win.storedState = null;

		this.focus(win);

		return true;
	}

	reparent_old(
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
		const rootWin = this.find(ROOT_WIN_ID);

		if (!win || id === ROOT_WIN_ID) return false;
		if (newParentId !== ROOT_WIN_ID && !newParent) return false;

		// Förhindra cykliska relationer.
		if (
			id === newParentId ||
			this.getDescendants(id).some((child) => child.winId === newParentId)
		) {
			return false;
		}

		let nextLeft = win.state.left;
		let nextTop = win.state.top;
		let nextWidth = win.state.width;
		let nextHeight = win.state.height;

		if (screenRect) {
			const targetLeft = screenRect.left ?? win.state.left;
			const targetTop = screenRect.top ?? win.state.top;
			nextWidth = screenRect.width ?? win.state.width;
			nextHeight = screenRect.height ?? win.state.height;

			if (newParentId !== ROOT_WIN_ID && newParent?.boundingEl) {
				// 🌟 DROP INUTI ETT ANNAT FÖNSTER:
				const parentRect = newParent.boundingEl.getBoundingClientRect();
				const pWidth = newParent.state.width;
				const pHeight = newParent.state.height;

				// 1. Konvertera skärmkoordinaten till förälderns LOKALA koordinatsystem
				nextLeft = targetLeft - parentRect.left;
				nextTop = targetTop - parentRect.top;

				// 2. Säkra att fönstret inte startar utanför förälderns övre eller vänstra kant
				nextLeft = Math.max(0, nextLeft);
				nextTop = Math.max(0, nextTop);

				// 3. Justera storleken (Klipp bredden/höjden efter förälderns resterande yta!)
				// Istället för att krympa fönstret proportionellt, klipper vi det precis vid förälderns kant
				nextWidth = Math.min(nextWidth, pWidth - nextLeft);
				nextHeight = Math.min(nextHeight, pHeight - nextTop);
			} else {
				// 🌟 DROP TILLBAKA PÅ SKRIVBORDSROTEN (ROOT):
				// Vi använder inte längre document.querySelector!
				// Vi har frameEl i WindowFrame som mäter mot skärmen, så om vi släpper på roten
				// behöver vi bara konvertera skärmkoordinaten relativt programmets start-koordinat på skärmen.
				if (rootWin && newParent?.boundingEl) {
					// Om din vy skickar med en fungerande referens för roots bounds
					const rootRect = newParent.boundingEl.getBoundingClientRect();
					nextLeft = targetLeft - rootRect.left;
					nextTop = targetTop - rootRect.top;
				} else {
					// Fallback om rotens DOM saknas (t.ex. vid boot/synk)
					nextLeft = targetLeft;
					nextTop = targetTop;
				}
			}
		}

		// Uppdatera relation och geometri.
		win.parentId = newParentId;
		win.boundingEl = null;

		Object.assign(win.state, {
			left: nextLeft,
			top: nextTop,
			width: nextWidth,
			height: nextHeight,
			isMaximized: false, // Starta omaximerat så den lokala geometrin gäller
		});

		win.docking = {};
		win.storedState = null;

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
	updateProps(
		props: Record<string, unknown>,
		id?: WindowId,
	): void {
		if (id) {
			const win = this.find(id);
			if (!win) return;
			Object.assign(win.props, props);
			return;
		}
		for (const win of this.windows) {
			for (const key of Object.keys(props)) {
				if (key in win.props) {
					win.props[key] = props[key];
				}
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

	// Inuti setupStandaloneSync(winId: WindowId) i windowManager.svelte.ts
	setupStandaloneSync(winId: WindowId): () => void {
		const unsubscribeMessage = this.backend.onMessage(
			winId,
			(state) => {
				const win = this.find(winId);
				if (!win) return;

				this.updatePayload(winId, state.payload);
				const processedProps = deserializePropsWithFunctions(state.props, winId, this);
				this.updateProps(processedProps, winId);
			},
		);

		const cleanupEffect = $effect.root(() => {
			$effect(() => {
				const win = this.find(winId);
				if (!win) return;

				const payload = $state.snapshot(win.payload);
				const rawProps = $state.snapshot(win.props);

				// 🟢 SKICKA MED winId HÄR
				const cleanProps = serializePropsWithFunctions(rawProps, winId);

				this.backend.send(winId, {
					payload,
					props: cleanProps,
				});
			});
		});

		return () => {
			unsubscribeMessage();
			cleanupEffect();
			// 🟢 STÄDA BORT CALLBACKS NÄR SYNCEN UPPHÖR (FÖNSTRET STÄNGS/KOPPLAS IFRÅN)
			cleanupWindowCallbacks(winId);
		};
	}

	/**
	 * Startar dubbelriktad payload-synk för ett specifikt frikopplat fönster.
	 * Används både av huvudappen vid sömlös MDI-reparenting och av standalone-flikar.
	 */

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

	// closeWin(win: WindowInstance): void {
	// 	if (!win || win.winId === ROOT_WIN_ID) return;

	// 	// 🌟 1. Rensa bort alla lagrade funktions-callbacks för detta fönster
	// 	cleanupWindowCallbacks(win.winId);

	// 	// 2. Om fönstret är frikopplat (tab/tauri), säg till backend att stänga det fysiska fönstret
	// 	if (win.isDetached) {
	// 		this.backend.close(win.winId);
	// 	}

	// 	// 3. Ta bort fönstret från din reaktiva array
	// 	this.windows = this.windows.filter((w) => w.winId !== win.winId);
	// }

	closeWin(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		// Skapa ett Set med ID:t för fönstret vi vill stänga samt alla dess underfönster
		const ids = new Set([
			win.winId,
			...this.getDescendants(win.winId).map((w) => w.winId),
		]);

		// Filtrera bort alla dessa fönster från den reaktiva arrayen i en enda stöt
		this.windows = this.windows.filter((w) => !ids.has(w.winId));

		// 🟢 Kör städningen ifall fönstret stängdes inifrån MDI-miljön
		cleanupWindowCallbacks(win.winId);

		// Skicka signal till backend om det var frikopplat
		if (win.isDetached) {
			this.backend.close(win.winId);
		}
	}

	// windowManager.svelte.ts
	setBoundingEl(id: WindowId, el: HTMLElement | null): void {
		const win = this.find(id);
		if (win && win.boundingEl !== el) {
			win.boundingEl = el;
		}
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
