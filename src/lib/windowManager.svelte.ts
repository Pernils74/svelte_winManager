import { type Component, createContext } from "svelte";
import { getComponentKey, registerComponents } from "./windowComponentRegistry.ts";
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
	renderStrategy: RenderStrategy;
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
	parentId: WindowId | null;
}

import { type WindowViewPortType } from "./windowBackend.ts";

interface WindowViewPort {
	id: string;
	type: WindowViewPortType;
}

export interface WindowInstance<
	TProps extends Record<string, unknown> = Record<string, unknown>,
> {
	wManagerId: string;
	winId: WindowId;

	title: string;
	thumbnail: string | null;

	component: Component<any> | null;
	componentKey: string;

	/**
	 * All application-specific data belongs here.
	 * This object is reactive and synchronized between runtimes.
	 */
	props: TProps & Record<string, unknown>;
	parentId: WindowId | null;
	boundingEl: HTMLElement | null;
	state: WindowState;
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
	const { left, top, width, height } = win.state;

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

export class WindowManager {
	windows = $state<WindowInstance[]>([]);
	readonly wManagerId = crypto.randomUUID();
	private zCounter = 1;
	public readonly backend: WindowBackend;
	public readonly sync: WindowSync;
	// private registry: WindowRegistry;

	constructor(options: WindowManagerOptions = {}) {
		// startar backend och lyssning på broadcastchannel
		this.backend = options.backend ?? createWindowBackend();
		this.sync = new WindowSync(this.backend);
		// this.register=

		this.windows.push({
			wManagerId: this.wManagerId,
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
			(win) => win.winId !== ROOT_WIN_ID,
		).length;
	}

	debugBroadcast(winId: string, props: Record<string, unknown>): void {
		void this.sync.send(winId, { props });
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

	getChildren(parentId: WindowId): WindowInstance[] {
		return this.windows.filter(
			(win) => win.parentId === parentId,
		);
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

	getRenderableRoots(): WindowInstance[] {
		return this.getChildren(ROOT_WIN_ID).filter(
			(win) =>
				!win.state.isMinimized &&
				win.wManagerId === this.wManagerId,
		);
	}

	getRenderableChildren(parentId: WindowId): WindowInstance[] {
		return this.getChildren(parentId).filter(
			(win) =>
				!win.state.isMinimized &&
				win.wManagerId === this.wManagerId,
		);
	}

	getOrphanWorkspaceWindows(): WindowInstance[] {
		return this.windows.filter((win) => {
			if (win.winId === ROOT_WIN_ID || win.state.isMinimized || win.wManagerId !== this.wManagerId) {
				return false;
			}

			if (!win.parentId || win.parentId === ROOT_WIN_ID) {
				return false;
			}

			const parent = this.find(win.parentId);

			return (
				!parent ||
				parent.wManagerId !== this.wManagerId
			);
		});
	}

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

		const win = $state<WindowInstance<TProps>>({
			wManagerId: this.wManagerId,
			winId: options.winId ?? crypto.randomUUID(),
			title: options.title ?? component.name ?? "Window",
			thumbnail: null,
			component,
			componentKey: compKey,
			props: options.props ?? ({} as TProps),
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

		this.windows.push(win);

		return win;
	}

	// --------------------------------------------------
	// DUPLICATE
	// --------------------------------------------------

	duplicateWindow(source: WindowInstance, offset = 24, parentId?: WindowId): WindowInstance | undefined {
		if (source.winId === ROOT_WIN_ID || !source.component) return undefined;

		const copy = this.open(source.component, {
			title: `${source.title} (copy)`,
			parentId: parentId ?? source.parentId,
			componentKey: source.componentKey,
			props: structuredClone($state.snapshot(source.props)),

			left: source.state.left + offset,
			top: source.state.top + offset,

			width: source.state.width,
			height: source.state.height,

			transparency: source.state.transparency,
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
		const parentWidth = bounds?.clientWidth ?? parent.state.width;
		const parentHeight = bounds?.clientHeight ?? parent.state.height;
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
		newParentId: WindowId,
		screenRect: WindowRect,
	): boolean {
		const win = this.find(id);

		const parent = this.find(newParentId) ??
			this.find(ROOT_WIN_ID);

		if (!win || !parent) return false;
		if (id === ROOT_WIN_ID) return false;
		if (
			id === newParentId ||
			this.getDescendants(id).some(
				(child) => child.winId === newParentId,
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

		const geometry = this.fitToParent(parent, localRect);
		win.parentId = parent.winId;
		win.boundingEl = null;

		Object.assign(win.state, geometry, {
			isMaximized: false,
		});

		win.docking = {};
		win.storedState = null;

		this.focus(win);

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
	): void {
		if (win) {
			console.log("props");
			Object.assign(win.props, props);
			this.publishDetachedProps(win);
			return;
		}
		const keys = Object.keys(props);
		for (const current of this.windows) {
			if (
				keys.some((key) => key in current.props)
			) {
				Object.assign(current.props, props);
				this.publishDetachedProps(current);
			}
		}
	}

	private publishDetachedProps(win: WindowInstance): void {
		if (win.viewPort.type === "workspace") return;
		void this.sync.send(
			win.winId,
			{
				props: $state.snapshot(win.props),
			},
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

		if (win.winId === ROOT_WIN_ID) {
			Object.assign(win.state, updates);
			return;
		}
		Object.assign(win.state, updates);
		this.publishDetachedStateUpdate(win, updates);
	}

	updateMetrics(
		win: WindowInstance,
		updates: Partial<WindowMetrics>,
	): void {
		if (win.winId === ROOT_WIN_ID) return;
		Object.assign(win.metrics, updates);
	}

	updateAll(updates: Partial<WindowState>): void {
		for (const win of this.windows) {
			if (win.winId === ROOT_WIN_ID) continue;
			Object.assign(win.state, updates);
			this.publishDetachedStateUpdate(win, updates);
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

	// --------------------------------------------------
	// FOCUS
	// --------------------------------------------------

	focus(win: WindowInstance): void {
		if (win.winId === ROOT_WIN_ID) return;
		win.zIndex = ++this.zCounter;
		win.state.isFocused = true;
	}

	// --------------------------------------------------
	// MINIMIZE / RESTORE
	// --------------------------------------------------

	minimize(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID || win.state.isMinimized) return;

		win.storedState = rectOf(win);
		win.state.isMinimized = true;

		this.publishDetachedStateUpdate(win, {
			isMinimized: true,
		});
	}

	restore(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		if (win.storedState) {
			Object.assign(win.state, win.storedState);
		}

		win.state.isMinimized = false;
		win.state.isFocused = true;

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
		if (win.viewPort.type === "workspace") return;

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
		await this.sync.sendStateUpdate(winId, updates);
	}

	// --------------------------------------------------
	// RESIZE DOCKED
	// --------------------------------------------------

	resizeDockedWindow(
		win: WindowInstance,
		mode: ResizeMode,
		proposed: Partial<WindowRect>,
	): void {
		if (win.winId === ROOT_WIN_ID) return;
		const old = rectOf(win);
		const next: WindowRect = {
			...old,
			...proposed,
		};
		const siblings = this.getChildren(
			win.parentId ?? ROOT_WIN_ID,
		);
		const neighbors = siblings.filter((other) => {
			if (
				other.winId === win.winId ||
				other.state.isMinimized
			) {
				return false;
			}

			const b = other.state;

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
				const b = other.state;

				if (
					mode.includes("left") &&
					Math.abs(b.left + b.width - old.left) <= EPSILON
				) {
					const delta = next.left - old.left;

					const allowed = Math.max(
						delta,
						MIN_WIDTH - b.width,
					);

					next.left = old.left + allowed;
					next.width = old.width - allowed;

					other.state.width = b.width + allowed;
				} else if (
					mode.includes("right") &&
					Math.abs(b.left - (old.left + old.width)) <= EPSILON
				) {
					const delta = next.left + next.width -
						(old.left + old.width);

					const allowed = Math.min(
						delta,
						b.width - MIN_WIDTH,
					);

					next.width = old.width + allowed;

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

					const allowed = Math.max(
						delta,
						MIN_HEIGHT - b.height,
					);

					next.top = old.top + allowed;
					next.height = old.height - allowed;

					other.state.height = b.height + allowed;
				} else if (
					mode.includes("bottom") &&
					Math.abs(b.top - (old.top + old.height)) <= EPSILON
				) {
					const delta = next.top + next.height -
						(old.top + old.height);

					const allowed = Math.min(
						delta,
						b.height - MIN_HEIGHT,
					);

					next.height = old.height + allowed;

					other.state.top = b.top + allowed;
					other.state.height = b.height - allowed;
				}
			}
		}
		Object.assign(win.state, next);
		this.publishDetachedStateUpdate(win, next);
	}

	// --------------------------------------------------
	// MAXIMIZE
	// --------------------------------------------------

	toggleMaximize(
		win: WindowInstance,
		bounds: HTMLElement,
	): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		if (win.state.isMaximized) {
			if (win.storedState) {
				Object.assign(win.state, win.storedState);
			}

			win.state.isMaximized = false;

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

		const a = win.state;

		const siblings = this.getChildren(
			win.parentId ?? ROOT_WIN_ID,
		);

		for (const other of siblings) {
			if (
				other.winId === win.winId ||
				other.state.isMinimized
			) {
				continue;
			}

			const b = other.state;

			const overlapsY = a.top < b.top + b.height - MAXIMIZE_EPSILON &&
				a.top + a.height > b.top + MAXIMIZE_EPSILON;

			const overlapsX = a.left < b.left + b.width - MAXIMIZE_EPSILON &&
				a.left + a.width > b.left + MAXIMIZE_EPSILON;

			if (
				overlapsY &&
				Math.abs(a.left - (b.left + b.width)) <= MAXIMIZE_EPSILON
			) {
				maxLeft = Math.max(
					maxLeft,
					b.left + b.width,
				);
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
				maxTop = Math.max(
					maxTop,
					b.top + b.height,
				);
			}

			if (
				overlapsX &&
				Math.abs(a.top + a.height - b.top) <= MAXIMIZE_EPSILON
			) {
				maxBottom = Math.min(maxBottom, b.top);
			}
		}

		Object.assign(win.state, {
			left: maxLeft,
			top: maxTop,

			width: Math.max(0, maxRight - maxLeft),
			height: Math.max(0, maxBottom - maxTop),

			isMaximized: true,
		});

		this.focus(win);

		this.publishDetachedStateUpdate(win, {
			...rectOf(win),
			isMaximized: true,
		});
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
				ROOT_WIN_ID,
				{
					left: child.state.left + win.state.left,
					top: child.state.top + win.state.top,
					width: child.state.width,
					height: child.state.height,
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
			props: $state.snapshot(win.props),

			width: win.state.width,
			height: win.state.height,

			left: win.state.left,
			top: win.state.top,
		};

		await this.sync.open(descriptor, target);

		this.sync.attachWindow(win, this);
	}

	// --------------------------------------------------
	// DETACHED SYNC
	// --------------------------------------------------

	// setupStandaloneSync(win: WindowInstance) {
	// 	this.sync.start(
	// 		win.winId,
	// 		() => ({
	// 			props: $state.snapshot(win.props),
	// 		}),
	// 		(state: DetachedWindowState) => {
	// 			this.updateProps(
	// 				state.props ?? {},
	// 				win,
	// 			);
	// 		},
	// 		(updates) => {
	// 			this.updateState(
	// 				win.winId,
	// 				updates,
	// 			);
	// 		},
	// 	);

	// 	return () => {
	// 		this.sync.stop(win.winId);
	// 	};
	// }

	// --------------------------------------------------
	// CLOSE
	// --------------------------------------------------

	async closeDetached(id: WindowId): Promise<void> {
		const win = this.find(id);

		if (!win || win.viewPort.type === "workspace") {
			return;
		}

		this.closeWin(win);
	}

	closeWin(win: WindowInstance): void {
		if (!win || win.winId === ROOT_WIN_ID) return;

		const ids = new Set([
			win.winId,
			...this.getDescendants(win.winId).map(
				(child) => child.winId,
			),
		]);

		for (const id of ids) {
			const child = this.find(id);

			this.sync.stop(id);

			if (
				child &&
				child.viewPort.type !== "workspace"
			) {
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
		const wManager = new WindowManager({
			backend: options?.backend,
		});

		if (options?.modules) {
			registerComponents(options.modules);
		}

		setContextManager(wManager);

		return wManager;
	}
}

export function getWindowManager(): WindowManager {
	return getContextManager();
}
