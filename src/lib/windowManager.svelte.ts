import { type Component, createContext } from "svelte";
import { getComponentKey, registerComponents } from "./windowComponentRegistry.ts";
import { WindowSync } from "./windowSync.svelte.ts";

import { createWindowBackend, type ExternalWindowDescriptor, type WindowBackend } from "./windowBackend.ts";

export const WINDOW_MANAGER_ROOT_ID = "wm_root";
export const EPSILON = 3;
export const MIN_WIDTH = 160;
export const MIN_HEIGHT = 100;

const MAXIMIZE_EPSILON = 5;

// Överst i din windowManager.svelte.ts tillsammans med WINDOW_MANAGER_ROOT_ID etc.
export interface AppConfig {
	theme: "light" | "dark";
	locale: string;
	modules: string[]; // Exempel på dina moduler som kommer in
	[key: string]: unknown;
}

const DEFAULT_CONFIG: AppConfig = {
	theme: "light",
	locale: "sv-SE",
	modules: [],
	onlySingleton: false,
};

export type WindowId = string;

export type DockSide =
	| "left"
	| "right"
	| "top"
	| "bottom";

export type ResizeMode =
	| "left"
	| "right"
	| "top"
	| "bottom"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export type RenderStrategy =
	| "immediate"
	| "latest-wins"
	| "throttled"
	| "manual";

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

export interface WindowMetrics {
	renderMs: number;
	renderBusy: boolean;
	isBusy?: boolean;
	renderStrategy: RenderStrategy;
	renderCount?: number;
	droppedUpdates?: number;
}

export interface WindowState extends WindowRect {
	isMinimized: boolean;
	isMaximized: boolean;
	transparency: number;
	isFocused: boolean;
}

export interface WindowComponentProps<
	TProps extends Record<string, unknown> = Record<string, unknown>,
> {
	win: WindowInstance<TProps>;
	winId: WindowId;
	renderTargetWinId: WindowId | null;
}

import { type WindowViewPortType } from "./windowBackend.ts";

export interface WindowInstance<
	TProps extends Record<string, unknown> = Record<string, unknown>,
> {
	wManagerId: string;
	winId: WindowId;

	/**
	 * WinId för fönstret som skapade denna instans.
	 * Förblir oförändrad även om fönstret detachas.
	 */
	parentId: WindowId | null;

	/**
	 * WinId för fönstret där denna instans renderas.
	 * Kan ändras vid reparenting eller detach.
	 */
	renderTargetWinId: WindowId | null;

	title: string;
	thumbnail: string | null;

	component: Component<any> | null;
	componentKey: string;

	/**
	 * All application-specific data belongs here.
	 * This object is reactive and synchronized between runtimes.
	 */
	props: TProps & Record<string, unknown>;

	boundingEl: HTMLElement | null;
	rect: WindowRect;
	isDetached?: boolean;
	renderStrategy?: RenderStrategy;
	runtime?: { type?: string; id?: string };
	context?: unknown;

	isMaximized: boolean;
	transparency: number;
	isFocused: boolean;
	isMinimized: boolean;

	storedState: WindowRect | null;

	zIndex: number;
	tileOffset: number;

	showButtons: boolean;
	docking: WindowDocking;
	titlebar?: WindowTiltlebarComponent;

	metrics: WindowMetrics;
}

export interface OpenWindowOptions<
	TProps extends Record<string, unknown> = Record<string, unknown>,
> {
	winId?: WindowId;
	title?: string;
	parentId?: WindowId | null;
	renderTargetWinId?: WindowId | null;

	boundingEl?: HTMLElement | null;
	tileOffset?: number;

	props?: TProps;

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
	const { left, top, width, height } = win.rect;

	return {
		left,
		top,
		width,
		height,
	};
}

function overlaps(
	startA: number,
	endA: number,
	startB: number,
	endB: number,
): boolean {
	return startA < endB - EPSILON &&
		endA > startB + EPSILON;
}

function isWindowInstance(
	value: WindowInstance | Component<any>,
): value is WindowInstance {
	return typeof value === "object" &&
		value !== null &&
		"winId" in value &&
		"wManagerId" in value;
}

function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function reconcileObject(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): void {
	for (const key of Object.keys(target)) {
		if (!Object.prototype.hasOwnProperty.call(source, key)) {
			delete target[key];
		}
	}

	for (const [key, value] of Object.entries(source)) {
		const current = target[key];
		if (isPlainObject(current) && isPlainObject(value)) {
			reconcileObject(current, value);
		} else {
			target[key] = value;
		}
	}
}

export class WindowManager {
	windows = $state<WindowInstance[]>([]);
	readonly wManagerId = crypto.randomUUID();
	public readonly config: AppConfig;
	public currentParentId: WindowId | null = null;

	private zCounter = 1;
	public readonly backend: WindowBackend;
	public readonly sync: WindowSync;
	// private registry: WindowRegistry;

	constructor(options: WindowManagerOptions = {}) {
		// startar backend och lyssning på broadcastchannel
		this.config = {
			...DEFAULT_CONFIG,
			...options.config,
		};

		this.backend = options.backend ?? createWindowBackend();
		this.sync = new WindowSync(this.backend);
		// this.register=

		this.windows.push({
			wManagerId: this.wManagerId,
			winId: WINDOW_MANAGER_ROOT_ID,
			parentId: null,
			title: "Root Workspace",
			thumbnail: null,
			component: null,
			componentKey: "",
			props: {},
			renderTargetWinId: null,
			boundingEl: null,
			rect: {
				left: 0,
				top: 0,
				width: 1920,
				height: 1080,
			},
			isMinimized: false,
			isMaximized: false,
			transparency: 1,
			isFocused: false,
			storedState: null,
			zIndex: 0,
			tileOffset: 0,
			showButtons: false,
			docking: {},
			metrics: {
				renderMs: 0,
				renderStrategy: "immediate",
				renderBusy: false,
			},
		});
	}

	// --------------------------------------------------
	// GETTERS
	// --------------------------------------------------

	get winCount(): number {
		return this.windows.filter(
			(win) => win.winId !== WINDOW_MANAGER_ROOT_ID,
		).length;
	}

	debugBroadcast(winId: string, props: Record<string, unknown>): void {
		const win = this.find(winId);
		if (!win) {
			throw new Error(`Fönstret ${winId} hittades inte.`);
		}

		void this.sync.send(
			winId,
			props,
			win.wManagerId,
			win.parentId,
			win.renderTargetWinId ?? WINDOW_MANAGER_ROOT_ID,
		);
	}

	findAll(winId: WindowId): WindowInstance[] {
		return this.windows.filter((win) => win.winId === winId);
	}

	find(id: WindowId | null | undefined): WindowInstance | undefined {
		if (!id) return undefined;

		return this.windows.find(
			(win) => win.winId === id,
		);
	}

	findByTitle(title: string): WindowInstance | undefined {
		return this.windows.find(
			(win) => win.title === title,
		);
	}

	getChildren(renderTargetWinId: WindowId): WindowInstance[] {
		return this.windows.filter(
			(win) => win.renderTargetWinId === renderTargetWinId,
		);
	}

	getDescendants(renderTargetWinId: WindowId): WindowInstance[] {
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

		visit(renderTargetWinId);

		return result;
	}

	getRenderableRoots(): WindowInstance[] {
		return this.getChildren(WINDOW_MANAGER_ROOT_ID).filter(
			(win) =>
				!win.isMinimized &&
				win.wManagerId === this.wManagerId,
		);
	}

	getRenderableChildren(renderTargetWinId: WindowId): WindowInstance[] {
		return this.getChildren(renderTargetWinId).filter(
			(win) =>
				!win.isMinimized &&
				win.wManagerId === this.wManagerId,
		);
	}

	getOrphanWorkspaceWindows(): WindowInstance[] {
		return this.windows.filter((win) => {
			if (win.winId === WINDOW_MANAGER_ROOT_ID || win.isMinimized || win.wManagerId !== this.wManagerId) {
				return false;
			}

			if (!win.renderTargetWinId || win.renderTargetWinId === WINDOW_MANAGER_ROOT_ID) {
				return false;
			}

			const parent = this.find(win.renderTargetWinId);

			return (
				!parent ||
				parent.wManagerId !== this.wManagerId
			);
		});
	}

	// open<TProps extends Record<string, unknown> = Record<string, unknown>>(
	// 	component: Component<any>,
	// 	options?: OpenWindowOptions<TProps>,
	// ): WindowInstance<TProps>;
	// open<TProps extends Record<string, unknown> = Record<string, unknown>>(
	// 	parent: WindowInstance,
	// 	component: Component<any>,
	// 	options?: OpenWindowOptions<TProps>,
	// ): WindowInstance<TProps>;
	// open<TProps extends Record<string, unknown> = Record<string, unknown>>(
	// 	first: WindowInstance | Component<any>,
	// 	second: Component<any> | OpenWindowOptions<TProps> = {},
	// 	third: OpenWindowOptions<TProps> = {},
	// ): WindowInstance<TProps> {
	// 	if (isWindowInstance(first)) {
	// 		return this.openWindow(second as Component<any>, {
	// 			...third,
	// 			parentId: first.winId,
	// 		});
	// 	}

	// 	return this.openWindow(
	// 		first,
	// 		second as OpenWindowOptions<TProps>,
	// 	);
	// }

	// --------------------------------------------------
	// OPEN
	// --------------------------------------------------

	open<TProps extends Record<string, unknown> = Record<string, unknown>>(
		component: Component<any>,
		options: OpenWindowOptions<TProps> = {},
	): WindowInstance<TProps> {
		if (options.winId) {
			const existing = this.find(options.winId);

			if (existing) {
				return existing as WindowInstance<TProps>;
			}
		}
		// const parent = this.find(options.renderTargetWinId ?? WINDOW_MANAGER_ROOT_ID) ??
		// 	this.find(WINDOW_MANAGER_ROOT_ID)!;

		const renderTargetWinId = this.find(options.renderTargetWinId ?? WINDOW_MANAGER_ROOT_ID)?.winId ??
			WINDOW_MANAGER_ROOT_ID;

		const parentId = options.parentId !== undefined ? options.parentId : this.currentParentId;
		const tileOffset = options.tileOffset ?? 20;

		const siblingCount = this.getChildren(renderTargetWinId).length;

		const currentOffset = siblingCount * tileOffset;
		const compKey = options.componentKey ?? getComponentKey(component);
		if (!compKey) {
			throw new Error(
				`Komponenten "${
					component.name ?? "unknown"
				}" är inte registrerad. Ange componentKey eller registrera komponenten först.`,
			);
		}
		// const rect = this.fitToParent(parent, {
		// 	left: options.left ?? currentOffset,
		// 	top: options.top ?? currentOffset,
		// 	width: options.width ?? 400,
		// 	height: options.height ?? 300,
		// });
		const rect = {
			left: options.left ?? currentOffset,
			top: options.top ?? currentOffset,
			width: options.width ?? 400,
			height: options.height ?? 300,
		};

		const initProps = (options.props ?? ({} as TProps)) as TProps & Record<string, unknown>;
		const win = $state<WindowInstance<TProps>>({
			wManagerId: this.wManagerId,
			winId: options.winId ?? crypto.randomUUID(),
			parentId,
			title: options.title ?? component.name ?? "Window",
			thumbnail: null,
			component,
			componentKey: compKey,
			props: initProps,
			renderTargetWinId,
			boundingEl: options.boundingEl ?? null,
			rect: rect,
			isMinimized: false,
			isMaximized: false,
			transparency: options.transparency ?? 1,
			isFocused: false,
			storedState: null,
			zIndex: ++this.zCounter,
			tileOffset,
			showButtons: options.showButtons ?? true,
			docking: options.docking ?? {},
			titlebar: options.titlebar,
			metrics: {
				renderMs: 0,
				renderStrategy: "immediate",
				renderBusy: false,
			},
		});
		this.windows.push(win as any);
		this.sync.startToMonitor(win, this);
		return win;
	}

	// --------------------------------------------------
	// DETACH
	// --------------------------------------------------

	async detachWindow(
		win: WindowInstance,
		target: Exclude<WindowViewPortType, "workspace">,
	): Promise<void> {
		if (!win) {
			throw new Error("Window hittades inte.");
		}

		const children = this.getChildren(win.winId);
		for (const child of children) {
			if (child.wManagerId != this.wManagerId) continue;
			this.reparent(
				child.winId,
				WINDOW_MANAGER_ROOT_ID,
				{
					left: child.rect.left + win.rect.left,
					top: child.rect.top + win.rect.top,
					width: child.rect.width,
					height: child.rect.height,
				},
			);
		}

		const detachedManagerId = crypto.randomUUID();

		const descriptor: ExternalWindowDescriptor = {
			wManagerId: detachedManagerId,
			winId: win.winId,

			title: win.title,
			componentKey: win.componentKey,

			parentId: win.parentId,
			renderTargetWinId: win.renderTargetWinId, // renderTargetWinId kommer oftast sättas till nya root
			// renderTargetWinId: null, // detached window blir root i nya runtime
			props: $state.snapshot(win.props),

			width: win.rect.width,
			height: win.rect.height,

			left: win.rect.left,
			top: win.rect.top,
		};

		// detta för att förhindra att den renderas i nuvarande wManager.
		// Dvs kommer vara ett ghost fönster
		win.wManagerId = detachedManagerId;
		await this.sync.open(descriptor, target);
	}

	// --------------------------------------------------
	// DUPLICATE
	// --------------------------------------------------

	duplicateWindow(source: WindowInstance, offset = 24, renderTargetWinId?: WindowId): WindowInstance | undefined {
		if (source.winId === WINDOW_MANAGER_ROOT_ID || !source.component) return undefined;

		const copy = this.open(source.component, {
			title: `${source.title} (copy)`,
			renderTargetWinId: renderTargetWinId ?? source.renderTargetWinId,
			componentKey: source.componentKey,
			props: structuredClone($state.snapshot(source.props)),

			left: source.rect.left + offset,
			top: source.rect.top + offset,

			width: source.rect.width,
			height: source.rect.height,

			transparency: source.transparency,
			showButtons: source.showButtons,

			titlebar: source.titlebar,
		});

		for (const child of this.getChildren(source.winId)) {
			this.duplicateWindow(child, 0, copy.winId);
		}

		return copy;
	}

	// --------------------------------------------------
	// GEOMETRY
	// --------------------------------------------------

	private fitToParent(
		parent: WindowInstance,
		rect: Partial<WindowRect>,
	): WindowRect {
		const bounds = parent.boundingEl;
		const parentWidth = bounds?.clientWidth ?? parent.rect.width;
		const parentHeight = bounds?.clientHeight ?? parent.rect.height;
		const width = Math.min(
			rect.width ?? 400,
			parentWidth,
		);
		const height = Math.min(rect.height ?? 300, parentHeight);
		const left = Math.max(0, Math.min(rect.left ?? 0, parentWidth - width));
		const top = Math.max(0, Math.min(rect.top ?? 0, parentHeight - height));

		return { left, top, width, height };
	}

	reparent(
		id: WindowId,
		newRenderTargetWinId: WindowId,
		screenRect: WindowRect,
	): boolean {
		const win = this.find(id);

		const parent = this.find(newRenderTargetWinId) ??
			this.find(WINDOW_MANAGER_ROOT_ID);

		if (!win || !parent) return false;
		if (id === WINDOW_MANAGER_ROOT_ID) return false;

		if (
			id === newRenderTargetWinId ||
			this.getDescendants(id).some(
				(child) => child.winId === newRenderTargetWinId,
			)
		) {
			return false;
		}

		const bounds = parent.boundingEl;
		if (!bounds) return false;
		const parentRect = bounds.getBoundingClientRect();
		const localRect = {
			left: screenRect.left -
				parentRect.left +
				bounds.scrollLeft,

			top: screenRect.top -
				parentRect.top +
				bounds.scrollTop,

			width: screenRect.width,
			height: screenRect.height,
		};

		const rect = this.fitToParent(parent, localRect);
		win.renderTargetWinId = parent.winId;
		win.boundingEl = null;

		Object.assign(win.rect, rect, {
			isMaximized: false,
		});

		win.docking = {};
		win.storedState = null;

		this.focus(win);
		// console.log(
		// 	"[after]",
		// 	win.title,
		// 	"parent=",
		// 	win.renderTargetWinId,
		// );
		// console.log(
		// 	this.getChildren(parent.winId).map((w) => w.title),
		// );
		return true;
	}

	// --------------------------------------------------
	// PROPS
	// --------------------------------------------------

	/**
	 * Updates props on a specific window.
	 *
	 * If no window is supplied, updates windows
	 * that already contain at least one matching key.
	 *
	 * Props are the only application data channel.
	 */
	updateProps<TProps extends Record<string, unknown>>(
		props: Partial<TProps>,
		win?: WindowInstance<TProps>,
		options: { publish?: boolean; preserveReferences?: boolean } = {},
	): void {
		// console.log("updateprops");
		const targets = win
			? this.windows.filter((current) =>
				current.parentId === win.parentId &&
				current.componentKey === win.componentKey
			)
			: this.windows.filter((current) =>
				Object.keys(props).some(
					(key) => key in current.props,
				)
			);

		for (const current of targets) {
			if (options.preserveReferences) {
				reconcileObject(
					current.props,
					props as Record<string, unknown>,
				);
			} else {
				Object.assign(current.props, props);
			}
			if (options.publish !== false) {
				this.publishProps(current);
			}
		}
	}

	private publishProps(win: WindowInstance): void {
		void this.sync.send(
			win.winId,
			$state.snapshot(win.props),
			win.wManagerId,
			win.parentId,
			win.renderTargetWinId ?? WINDOW_MANAGER_ROOT_ID,
		).catch((error) => {
			console.error(
				`[WindowManager] Props-synk misslyckades för ${win.winId}:`,
				error,
			);
		});
	}

	// --------------------------------------------------
	// STATE
	// --------------------------------------------------

	updateState(
		id: WindowId,
		updates: Partial<WindowState>,
	): void {
		const win = this.find(id);
		if (!win) return;

		const { left, top, width, height, ...windowState } = updates;
		Object.assign(win.rect, {
			...(left !== undefined && { left }),
			...(top !== undefined && { top }),
			...(width !== undefined && { width }),
			...(height !== undefined && { height }),
		});
		Object.assign(win, windowState);

		if (win.winId !== WINDOW_MANAGER_ROOT_ID) {
			this.publishDetachedStateUpdate(win, updates);
		}
	}

	updateMetrics(
		win: WindowInstance,
		updates: Partial<WindowMetrics>,
	): void {
		if (win.winId === WINDOW_MANAGER_ROOT_ID) return;
		Object.assign(win.metrics, updates);
	}

	updateAll(updates: Partial<WindowState>): void {
		for (const win of this.windows) {
			if (win.winId === WINDOW_MANAGER_ROOT_ID) continue;

			const {
				left,
				top,
				width,
				height,
				...windowState
			} = updates;

			Object.assign(win.rect, {
				...(left !== undefined && { left }),
				...(top !== undefined && { top }),
				...(width !== undefined && { width }),
				...(height !== undefined && { height }),
			});

			Object.assign(win, windowState);

			this.publishDetachedStateUpdate(win, updates);
		}
	}

	setRootBounds(width: number, height: number): void {
		const root = this.find(WINDOW_MANAGER_ROOT_ID);

		if (!root) return;

		Object.assign(root.rect, {
			left: 0,
			top: 0,
			width: Math.max(0, width),
			height: Math.max(0, height),
		});
	}

	// --------------------------------------------------
	// FOCUS
	// --------------------------------------------------

	focus(win: WindowInstance): void {
		if (win.winId === WINDOW_MANAGER_ROOT_ID) return;
		win.zIndex = ++this.zCounter;
		win.isFocused = true;
	}

	// --------------------------------------------------
	// MINIMIZE / RESTORE
	// --------------------------------------------------

	minimize(win: WindowInstance): void {
		if (!win || win.winId === WINDOW_MANAGER_ROOT_ID || win.isMinimized) return;

		win.storedState = rectOf(win);
		win.isMinimized = true;

		this.publishDetachedStateUpdate(win, {
			isMinimized: true,
		});
	}

	restore(win: WindowInstance): void {
		if (!win || win.winId === WINDOW_MANAGER_ROOT_ID) return;

		if (win.storedState) {
			Object.assign(win.rect, win.storedState);
		}

		win.isMinimized = false;
		win.isFocused = true;

		this.focus(win);

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
		if (win.wManagerId != this.wManagerId) return;

		void this.sendWindowStateUpdate(
			win.winId,
			updates,
		).catch((error) => {
			console.error(
				`[WindowManager] State-synk misslyckades för ${win.winId}:`,
				error,
			);
		});
	}

	async sendWindowStateUpdate(
		winId: WindowId,
		updates: Partial<WindowState>,
	): Promise<void> {
		const win = this.find(winId);
		if (!win) {
			throw new Error(`Fönstret ${winId} hittades inte.`);
		}

		await this.sync.sendStateUpdate(winId, updates, win.wManagerId);
	}

	// --------------------------------------------------
	// RESIZE DOCKED
	// --------------------------------------------------

	resizeDockedWindow(
		win: WindowInstance,
		mode: ResizeMode,
		proposed: Partial<WindowRect>,
	): void {
		if (win.winId === WINDOW_MANAGER_ROOT_ID) return;
		const old = rectOf(win);
		const next: WindowRect = {
			...old,
			...proposed,
		};
		const siblings = this.getChildren(
			win.renderTargetWinId ?? WINDOW_MANAGER_ROOT_ID,
		);
		const neighbors = siblings.filter((other) => {
			if (
				other.winId === win.winId ||
				other.isMinimized
			) {
				return false;
			}

			const b = other.rect;

			return (
				(mode.includes("left") &&
					Math.abs(b.left + b.width - old.left) <= EPSILON &&
					overlaps(
						old.top,
						old.top + old.height,
						b.top,
						b.top + b.height,
					)) ||
				(mode.includes("right") &&
					Math.abs(b.left - (old.left + old.width)) <= EPSILON &&
					overlaps(
						old.top,
						old.top + old.height,
						b.top,
						b.top + b.height,
					)) ||
				(mode.includes("top") &&
					Math.abs(b.top + b.height - old.top) <= EPSILON &&
					overlaps(
						old.left,
						old.left + old.width,
						b.left,
						b.left + b.width,
					)) ||
				(mode.includes("bottom") &&
					Math.abs(b.top - (old.top + old.height)) <= EPSILON &&
					overlaps(
						old.left,
						old.left + old.width,
						b.left,
						b.left + b.width,
					))
			);
		});

		if (mode.includes("left") || mode.includes("right")) {
			for (const other of neighbors) {
				const b = other.rect;

				if (
					mode.includes("left") &&
					Math.abs(b.left + b.width - old.left) <= EPSILON
				) {
					const delta = next.left - old.left;
					const allowed = Math.max(delta, MIN_WIDTH - b.width);
					next.left = old.left + allowed;
					next.width = old.width - allowed;

					other.rect.width = b.width + allowed;
				} else if (
					mode.includes("right") &&
					Math.abs(b.left - (old.left + old.width)) <= EPSILON
				) {
					const delta = next.left + next.width - (old.left + old.width);
					const allowed = Math.min(delta, b.width - MIN_WIDTH);
					next.width = old.width + allowed;
					other.rect.left = b.left + allowed;
					other.rect.width = b.width - allowed;
				}
			}
		}

		if (mode.includes("top") || mode.includes("bottom")) {
			for (const other of neighbors) {
				const b = other.rect;

				if (
					mode.includes("top") &&
					Math.abs(b.top + b.height - old.top) <= EPSILON
				) {
					const delta = next.top - old.top;
					const allowed = Math.max(
						delta,
						MIN_HEIGHT - b.height,
					);
					next.top = old.top + allowed;
					next.height = old.height - allowed;

					other.rect.height = b.height + allowed;
				} else if (mode.includes("bottom") && Math.abs(b.top - (old.top + old.height)) <= EPSILON) {
					const delta = next.top + next.height - (old.top + old.height);
					const allowed = Math.min(delta, b.height - MIN_HEIGHT);

					next.height = old.height + allowed;

					other.rect.top = b.top + allowed;
					other.rect.height = b.height - allowed;
				}
			}
		}
		Object.assign(win.rect, next);
		this.publishDetachedStateUpdate(win, next);
	}

	// --------------------------------------------------
	// MAXIMIZE
	// --------------------------------------------------
	toggleMaximize(
		win: WindowInstance,
		bounds: HTMLElement,
	): void {
		if (!win || win.winId === WINDOW_MANAGER_ROOT_ID) return;

		if (win.isMaximized) {
			if (win.storedState) {
				Object.assign(win.rect, win.storedState);
			}

			win.isMaximized = false;

			this.focus(win);

			this.publishDetachedStateUpdate(win, {
				...rectOf(win),
				isMaximized: false,
			});

			return;
		}

		win.storedState = rectOf(win);

		let maxLeft = 0;
		let maxTop = 0;
		let maxRight = bounds.clientWidth;
		let maxBottom = bounds.clientHeight;

		const a = win.rect;

		const siblings = this.getChildren(
			win.renderTargetWinId ?? WINDOW_MANAGER_ROOT_ID,
		);

		for (const other of siblings) {
			if (
				other.winId === win.winId ||
				other.isMinimized
			) {
				continue;
			}

			const b = other.rect;

			const overlapsY = a.top < b.top + b.height - MAXIMIZE_EPSILON &&
				a.top + a.height > b.top + MAXIMIZE_EPSILON;

			const overlapsX = a.left < b.left + b.width - MAXIMIZE_EPSILON &&
				a.left + a.width > b.left + MAXIMIZE_EPSILON;

			if (
				overlapsY &&
				Math.abs(
						a.left - (b.left + b.width),
					) <= MAXIMIZE_EPSILON
			) {
				maxLeft = Math.max(
					maxLeft,
					b.left + b.width,
				);
			}

			if (
				overlapsY &&
				Math.abs(
						a.left + a.width - b.left,
					) <= MAXIMIZE_EPSILON
			) {
				maxRight = Math.min(
					maxRight,
					b.left,
				);
			}

			if (
				overlapsX &&
				Math.abs(
						a.top - (b.top + b.height),
					) <= MAXIMIZE_EPSILON
			) {
				maxTop = Math.max(maxTop, b.top + b.height);
			}

			if (overlapsX && Math.abs(a.top + a.height - b.top) <= MAXIMIZE_EPSILON) {
				maxBottom = Math.min(maxBottom, b.top);
			}
		}

		Object.assign(win.rect, {
			left: maxLeft,
			top: maxTop,
			width: Math.max(0, maxRight - maxLeft),
			height: Math.max(0, maxBottom - maxTop),
		});

		win.isMaximized = true;

		this.focus(win);

		this.publishDetachedStateUpdate(win, {
			...rectOf(win),
			isMaximized: true,
		});
	} // --------------------------------------------------
	// DETACHED SYNC
	// --------------------------------------------------

	// --------------------------------------------------
	// CLOSE
	// --------------------------------------------------

	async closeDetached(id: WindowId): Promise<void> {
		const win = this.find(id);

		// if (!win || win.viewPort.type === "workspace") {
		if (!win || win.wManagerId == this.wManagerId) {
			return;
		}

		this.closeWin(win);
	}

	closeWin(win: WindowInstance): void {
		if (!win || win.winId === WINDOW_MANAGER_ROOT_ID) return;

		const ids = new Set([
			win.winId,
			...this.getDescendants(win.winId).map(
				(child) => child.winId,
			),
		]);

		for (const id of ids) {
			const child = this.find(id);

			this.sync.stop(id);

			// if (child && child.viewPort.type !== "workspace") {
			if (child) {
				void this.backend.close(id, child.wManagerId).catch((error) => {
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
		this.sync.stop(win.winId);
	}

	// --------------------------------------------------
	// DOM / THUMBNAIL
	// --------------------------------------------------

	setBoundingEl(
		id: WindowId,
		el: HTMLElement | null,
	): void {
		const win = this.find(id);

		if (win && win.boundingEl !== el) {
			win.boundingEl = el;
		}
	}

	setThumbnail(
		win: WindowInstance,
		thumbnail: string | null,
	): void {
		win.thumbnail = thumbnail;
	}
}

// --------------------------------------------------
// CONTEXT
// --------------------------------------------------

const [getContextManager, setContextManager] = createContext<WindowManager>();
// const [getCurrentWindow, setCurrentWindow] = createContext<WindowInstance>();

// export interface WindowManagerOptions {
// 	modules?: Record<string, () => Promise<any>>;
// 	backend?: WindowBackend;
// }

export interface WindowManagerOptions {
	config?: Partial<AppConfig>;
	modules?: Record<string, () => Promise<any>>;
	backend?: WindowBackend;
}

export function initializeWindowManager(
	options?: WindowManagerOptions,
): WindowManager {
	// 1. Slå ihop hårdkodade defaults med vad som skickades in i app-starten

	try {
		return getContextManager();
	} catch {
		const wManager = new WindowManager({
			backend: options?.backend,
			config: options?.config,
		});
		if (options?.modules) {
			registerComponents(options.modules);
		}
		setContextManager(wManager);
		return wManager;
	}
}

// export function getWindowManager({ parentId = "root" }: { parentId?: WindowId | WindowInstance } = {}): WindowManager {
// 	const manager = getContextManager();
// 	// Här har du nu tillgång till parentId (antingen det som skickades in eller "root")
// 	return manager;
// }

const [getContextParentId, setContextParentId] = createContext<WindowId>();

export function getWindowManager(
	{ parentId }: { parentId?: WindowId } = {},
): WindowManager {
	const manager = getContextManager();

	// 1. Om WindowFrame skickade med parentId, spara det i Svelte context för alla barnkomponenter
	if (parentId) {
		setContextParentId(parentId);
	}

	// 2. Läs av parentId (antingen det som just skickades in, eller det som ärvts från WindowFrame)
	let resolvedParentId: WindowId = WINDOW_MANAGER_ROOT_ID;
	if (parentId) {
		resolvedParentId = parentId;
	} else {
		try {
			resolvedParentId = getContextParentId();
		} catch {
			// Vi är på rotnivå (utanför en WindowFrame)
			resolvedParentId = WINDOW_MANAGER_ROOT_ID;
		}
	}

	// Return a scoped view without losing the manager instance's private state.
	const currentParentId = resolvedParentId === WINDOW_MANAGER_ROOT_ID ? null : resolvedParentId;
	return new Proxy(manager, {
		get(target, property) {
			if (property === "currentParentId") {
				return currentParentId;
			}

			if (property === "open") {
				return (
					component: Component<any>,
					options: OpenWindowOptions = {},
				) =>
					target.open(component, {
						...options,
						parentId: options.parentId !== undefined ? options.parentId : currentParentId,
					});
			}

			// if (property === "open") {
			// 	return (
			// 		first: WindowInstance | Component<any>,
			// 		second: Component<any> | OpenWindowOptions = {},
			// 		third?: OpenWindowOptions,
			// 	) => {
			// 		if (isWindowInstance(first)) {
			// 			return target.open(first, second as Component<any>, third);
			// 		}

			// 		const options = second as OpenWindowOptions;
			// 		return target.openWindow(first, {
			// 			...options,
			// 			parentId: options.parentId !== undefined ? options.parentId : currentParentId,
			// 		});
			// 	};
			// }

			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

// export function getWindowManager(
// 	windowContext?: WindowInstance,
// ): WindowManager {
// 	const manager = getContextManager();

// 	if (windowContext) {
// 		setCurrentWindow(windowContext);
// 	}

// 	let currentWindow: WindowInstance;
// 	try {
// 		currentWindow = getCurrentWindow();
// 	} catch {
// 		return manager;
// 	}
