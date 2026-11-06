// src/lib/windowBackend.ts

import type { WindowId, WindowState } from "./windowManager.svelte";

export interface DetachedWindowState {
	props: Record<string, unknown>;
}

export type WindowMessage =
	| { type: "sync:props"; winId: WindowId; state: DetachedWindowState }
	| {
		type: "sync:state-update";
		winId: WindowId;
		updates: Partial<WindowState>;
	}
	| {
		type: "rpc:request";
		winId: WindowId;
		requestId: string;
		sourceId: string;
		targetEndpointId?: string;
		method: string;
		args: unknown[];
	}
	| {
		type: "rpc:response";
		winId: WindowId;
		requestId: string;
		sourceId: string;
		targetEndpointId: string;
		result?: unknown;
		error?: string;
	}
	| { type: "system:close"; winId: WindowId }
	| {
		type: "registry:snapshot";
		version: number;
		entries: WindowRegistryEntry[];
	};

export interface WindowTransportPacket {
	winId: WindowId;
	sourceId: string;
	message: WindowMessage;
}

// --------------------------------------------------
// --------------------------------------------------

export type WindowViewPortType =
	| "workspace"
	| "browser-tab"
	| "browser-window"
	| "tauri-window";

export interface ExternalWindowDescriptor {
	winId: string;
	title: string;
	componentKey: string;
	parentId?: WindowId | null;
	wMangerId: string;

	props: Record<string, unknown>;
	width?: number;
	height?: number;
	left?: number;
	top?: number;
}

/**
 * Transportpaket.
 *
 * Broker tolkar aldrig data.
 */
export type RawMessageCallback = (packet: WindowTransportPacket) => void;

export interface WindowBackend {
	readonly target: Exclude<WindowViewPortType, "workspace">;
	readonly endpointId: string;

	open(descriptor: ExternalWindowDescriptor, target: WindowViewPortType): Promise<void>;
	close(winId: string): Promise<void>;
	sendRaw(message: WindowMessage): Promise<void>;

	onRawMessage(winId: string, callback: RawMessageCallback): () => void;
	destroy(): void;
}

interface TauriEventApi {
	emit(event: string, payload: unknown): Promise<void>;
	listen(event: string, handler: (event: { payload: unknown }) => void): Promise<() => void>;
}

interface TauriWebviewWindow {
	label: string;
	close(): Promise<void>;
}

interface TauriWebviewWindowApi {
	WebviewWindow: new (label: string, options: Record<string, unknown>) => {
		once(
			event: string,
			callback: (event: {
				payload?: unknown;
			}) => void,
		): void;
	};

	getAllWebviewWindows(): Promise<
		TauriWebviewWindow[]
	>;
}

const CHANNEL_NAME = "svelte_winmanager_channel";

const STORAGE_MESSAGE_PREFIX = "svelte_winmanager_message_";

const STORAGE_INIT_PREFIX = "win_payload_init_";

const TAURI_EVENT_PREFIX = "svelte-winmanager:";

interface WindowRegistryEntry {
	winId: WindowId;
	parentId: WindowId | null;
	wManagerId: string;
	componentKey: string;
	viewPortType: WindowViewPortType;
}

export class WindowsRegistryService {
	windows = new Map<
		WindowId,
		WindowRegistryEntry
	>();

	version = 0;

	add(entry: WindowRegistryEntry): void {
		this.windows.set(entry.winId, structuredClone(entry));
		this.version++;
	}

	remove(winId: WindowId): void {
		if (this.windows.delete(winId)) {
			this.version++;
		}
	}

	replace(
		version: number,
		entries: WindowRegistryEntry[],
	): void {
		this.windows.clear();
		for (const entry of entries) {
			this.windows.set(
				entry.winId,
				structuredClone(entry),
			);
		}

		this.version = version;
	}

	snapshot() {
		return {
			version: this.version,
			entries: [...this.windows.values()],
		};
	}

	get(winId: WindowId): WindowRegistryEntry | undefined {
		return this.windows.get(winId);
	}

	getChildren(parentId: WindowId): WindowRegistryEntry[] {
		return [...this.windows.values()]
			.filter(
				(entry) => entry.parentId === parentId,
			);
	}

	update(winId: WindowId, updates: Partial<WindowRegistryEntry>): void {
		const entry = this.windows.get(winId);
		if (!entry) return;
		Object.assign(entry, updates);
		this.version++;
	}
}

function createId(): string {
	return crypto.randomUUID();
}

function isBrowser(): boolean {
	return typeof window !== "undefined";
}

function isTauri(): boolean {
	return (
		isBrowser() &&
		"__TAURI_INTERNALS__" in window
	);
}

function initStorageKey(winId: string): string {
	return `${STORAGE_INIT_PREFIX}${winId}`;
}

function tauriEventName(winId: string): string {
	return `${TAURI_EVENT_PREFIX}${winId}`;
}

function isTransportPacket(
	value: unknown,
): value is WindowTransportPacket {
	if (!value || typeof value !== "object") {
		return false;
	}

	const packet = value as Record<string, unknown>;

	if (
		!(
			typeof packet.winId === "string" &&
			typeof packet.sourceId === "string" &&
			!!packet.message &&
			typeof packet.message === "object" &&
			"winId" in packet.message &&
			packet.message.winId === packet.winId &&
			"type" in packet.message &&
			typeof packet.message.type === "string"
		)
	) {
		return false;
	}

	const message = packet.message as Record<string, unknown>;

	switch (message.type) {
		case "sync:props":
			return true;

		case "sync:state-update":
			return (
				!!message.updates &&
				typeof message.updates === "object" &&
				!Array.isArray(message.updates)
			);

		case "rpc:request":
			return (
				typeof message.requestId === "string" &&
				typeof message.sourceId === "string" &&
				typeof message.method === "string" &&
				Array.isArray(message.args) &&
				(
					message.targetEndpointId === undefined ||
					typeof message.targetEndpointId === "string"
				)
			);

		case "rpc:response":
			return (
				typeof message.requestId === "string" &&
				typeof message.sourceId === "string" &&
				typeof message.targetEndpointId === "string" &&
				(
					message.error === undefined ||
					typeof message.error === "string"
				)
			);

		case "system:close":
			return true;

		case "registry:snapshot":
			return (
				typeof message.version === "number" &&
				Array.isArray(message.entries)
			);

		default:
			return false;
	}
}

export class WindowBackendManager implements WindowBackend {
	public readonly winRegistry = new WindowsRegistryService();

	readonly target: Exclude<WindowViewPortType, "workspace">;
	readonly endpointId = createId();
	private channel: BroadcastChannel | null = null;
	private listeners = new Map<string, Set<RawMessageCallback>>();

	private initialMessages = new Map<
		string,
		WindowTransportPacket
	>();

	private openedWindows = new Map<string, Window | null>();
	private tauriListeners = new Map<string, Promise<() => void>>();

	private storageListener:
		| ((event: StorageEvent) => void)
		| null = null;

	private destroyed = false;

	constructor() {
		this.target = isTauri() ? "tauri-window" : "browser-tab";

		if (!isBrowser()) return;

		// startar lyssnaren på broadcasy channel
		if (this.target === "browser-tab") {
			this.initializeBrowserTransport();
		}
	}

	// --------------------------------------------------
	// Browser transport
	// --------------------------------------------------

	private initializeBrowserTransport(): void {
		if (
			typeof BroadcastChannel !==
				"undefined"
		) {
			this.channel = new BroadcastChannel(
				CHANNEL_NAME,
			);

			this.channel.onmessage = (
				event: MessageEvent<unknown>,
			) => {
				this.receivePacket(event.data);
			};
		}

		this.storageListener = (
			event: StorageEvent,
		) => {
			if (
				!event.key?.startsWith(
					STORAGE_MESSAGE_PREFIX,
				)
			) {
				return;
			}

			if (!event.newValue) return;

			try {
				const packet: unknown = JSON.parse(
					event.newValue,
				);

				this.receivePacket(packet);
			} catch (error) {
				console.error(
					"[WindowBackend] Invalid storage packet:",
					error,
				);
			}
		};

		globalThis.addEventListener(
			"storage",
			this.storageListener,
		);

		this.readInitialState();
	}

	private readInitialState(): void {
		const winId = new URLSearchParams(
			globalThis.location.search,
		).get("winId");

		if (!winId) return;

		queueMicrotask(() => {
			if (this.destroyed) return;

			try {
				const key = initStorageKey(winId);

				const raw = localStorage.getItem(key);

				if (!raw) return;

				const state = JSON.parse(raw) as DetachedWindowState;

				localStorage.removeItem(key);

				const packet: WindowTransportPacket = {
					winId,
					sourceId: "initial-state",
					message: {
						type: "sync:props",
						winId,
						state,
					},
				};

				this.initialMessages.set(
					winId,
					packet,
				);

				this.notifyListeners(packet);
			} catch (error) {
				console.error(
					"[WindowBackend] Could not read initial state:",
					error,
				);
			}
		});
	}

	// --------------------------------------------------
	// Window lifecycle
	// --------------------------------------------------

	async open(
		descriptor: ExternalWindowDescriptor,
		target: WindowViewPortType,
	): Promise<void> {
		this.assertAlive();

		if (!descriptor.winId) {
			throw new Error(
				"winId saknas.",
			);
		}

		if (!descriptor.componentKey) {
			throw new Error(
				"componentKey saknas.",
			);
		}

		switch (target) {
			case "browser-tab":
				this.openBrowserTab(
					descriptor,
				);
				return;

			case "browser-window":
				this.openBrowserWindow(
					descriptor,
				);
				return;

			case "tauri-window":
				await this.openTauriWindow(
					descriptor,
				);
				return;

			case "workspace":
				throw new Error(
					"Workspace kan inte öppnas som externt fönster.",
				);
		}
	}

	private buildDetachedUrl(
		descriptor: ExternalWindowDescriptor,
	): URL {
		const url = new URL(globalThis.location.href);
		url.searchParams.set("winId", descriptor.winId);
		url.searchParams.set("componentKey", descriptor.componentKey);
		url.searchParams.set("title", descriptor.title);
		url.searchParams.set("wMangerId", descriptor.wMangerId);

		if (descriptor.parentId) {
			url.searchParams.set("parentId", descriptor.parentId);
		}
		return url;
	}

	private saveInitialState(
		descriptor: ExternalWindowDescriptor,
	): void {
		const state: DetachedWindowState = { props: descriptor.props ?? {} };
		try {
			localStorage.setItem(
				initStorageKey(descriptor.winId),
				JSON.stringify(state),
			);
		} catch (error) {
			throw new Error(
				`Kunde inte spara initial state: ${String(error)}`,
			);
		}
	}

	private openBrowserTab(
		descriptor: ExternalWindowDescriptor,
	): void {
		const url = this.buildDetachedUrl(
			descriptor,
		);
		this.saveInitialState(descriptor);
		const tab = globalThis.open(url.toString(), `_blank_${descriptor.winId}`);

		if (!tab) {
			localStorage.removeItem(
				initStorageKey(
					descriptor.winId,
				),
			);

			throw new Error(
				"Webbläsaren blockerade den nya fliken.",
			);
		}

		this.openedWindows.set(
			descriptor.winId,
			tab,
		);
	}

	private openBrowserWindow(descriptor: ExternalWindowDescriptor): void {
		const url = this.buildDetachedUrl(descriptor);

		this.saveInitialState(descriptor);

		const {
			winId,
			width = 1000,
			height = 700,
			left = 100,
			top = 100,
		} = descriptor;

		const popup = globalThis.open(
			url.toString(),
			`detached_${winId}`,
			[
				"popup=yes",
				`width=${Math.round(width)}`,
				`height=${Math.round(height)}`,
				`left=${Math.round(left)}`,
				`top=${Math.round(top)}`,
				"resizable=yes",
				"scrollbars=yes",
			].join(","),
		);

		if (!popup) {
			localStorage.removeItem(
				initStorageKey(winId),
			);

			throw new Error(
				"Webbläsaren blockerade popup-fönstret.",
			);
		}

		this.openedWindows.set(winId, popup);
	}

	private async openTauriWindow(
		descriptor: ExternalWindowDescriptor,
	): Promise<void> {
		const modulePath = "@tauri-apps/api/webviewWindow";

		const api = await import(
			/* @vite-ignore */ modulePath
		) as TauriWebviewWindowApi;

		const {
			winId,
			title,
			componentKey,
			width = 800,
			height = 600,
			left,
			top,
		} = descriptor;

		const params = new URLSearchParams({
			winId,
			componentKey,
			title,
		});

		if (descriptor.parentId) {
			params.set(
				"parentId",
				descriptor.parentId,
			);
		}

		const webview = new api.WebviewWindow(
			`detached-${winId}`,
			{
				url: `index.html?${params.toString()}`,
				title,
				width,
				height,
				...(left !== undefined ? { x: left } : {}),
				...(top !== undefined ? { y: top } : {}),
				decorations: true,
			},
		);

		await new Promise<void>(
			(resolve, reject) => {
				let settled = false;

				webview.once(
					"tauri://created",
					() => {
						if (settled) return;

						settled = true;
						resolve();
					},
				);

				webview.once(
					"tauri://error",
					(event) => {
						if (settled) return;

						settled = true;

						reject(
							new Error(
								String(
									event.payload ??
										"Tauri window creation failed.",
								),
							),
						);
					},
				);
			},
		);
	}

	async close(
		winId: string,
	): Promise<void> {
		this.assertAlive();

		if (
			this.target === "tauri-window"
		) {
			await this.closeTauriWindow(
				winId,
			);
			return;
		}

		const opened = this.openedWindows.get(winId);

		if (
			opened &&
			!opened.closed
		) {
			opened.close();
			this.openedWindows.delete(
				winId,
			);
			return;
		}

		await this.sendRaw({
			type: "system:close",
			winId,
		});
	}

	private async closeTauriWindow(
		winId: string,
	): Promise<void> {
		const modulePath = "@tauri-apps/api/webviewWindow";

		const api = await import(
			/* @vite-ignore */ modulePath
		) as TauriWebviewWindowApi;

		const windows = await api.getAllWebviewWindows();

		const target = windows.find(
			(item) =>
				item.label ===
					`detached-${winId}`,
		);

		if (target) {
			await target.close();
		}
	}

	// --------------------------------------------------
	// Raw transport
	// --------------------------------------------------

	async sendRaw(
		message: WindowMessage,
	): Promise<void> {
		this.assertAlive();

		if (!message.winId) {
			throw new Error(
				"sendRaw kräver ett meddelande med winId.",
			);
		}

		const packet: WindowTransportPacket = {
			winId: message.winId,
			sourceId: this.endpointId,
			message,
		};

		if (
			this.target === "tauri-window"
		) {
			const modulePath = "@tauri-apps/api/event";

			const api = await import(
				/* @vite-ignore */ modulePath
			) as TauriEventApi;

			await api.emit(
				tauriEventName(
					message.winId,
				),
				packet,
			);

			return;
		}

		if (this.channel) {
			this.channel.postMessage(
				packet,
			);
			return;
		}

		this.sendStoragePacket(
			packet,
		);
	}

	private sendStoragePacket(
		packet: WindowTransportPacket,
	): void {
		const key = `${STORAGE_MESSAGE_PREFIX}${createId()}`;

		try {
			localStorage.setItem(
				key,
				JSON.stringify(packet),
			);

			localStorage.removeItem(
				key,
			);
		} catch (error) {
			throw new Error(
				`Transport misslyckades: ${String(error)}`,
			);
		}
	}

	onRawMessage(
		winId: string,
		callback: RawMessageCallback,
	): () => void {
		this.assertAlive();

		let callbacks = this.listeners.get(winId);

		if (!callbacks) {
			callbacks = new Set();

			this.listeners.set(
				winId,
				callbacks,
			);
		}

		callbacks.add(callback);

		const initialMessage = this.initialMessages.get(
			winId,
		);

		if (initialMessage) {
			callback(initialMessage);
			this.initialMessages.delete(
				winId,
			);
		}

		if (
			this.target === "tauri-window"
		) {
			void this.ensureTauriListener(
				winId,
			);
		}

		return () => {
			const current = this.listeners.get(winId);

			if (!current) return;

			current.delete(callback);

			if (current.size === 0) {
				this.listeners.delete(
					winId,
				);
			}
		};
	}

	private async ensureTauriListener(
		winId: string,
	): Promise<void> {
		if (
			this.tauriListeners.has(winId)
		) {
			await this.tauriListeners.get(
				winId,
			);
			return;
		}

		const modulePath = "@tauri-apps/api/event";

		const promise = (async () => {
			const api = await import(
				/* @vite-ignore */ modulePath
			) as TauriEventApi;

			return api.listen(
				tauriEventName(
					winId,
				),
				(event) => {
					this.receivePacket(
						event.payload,
					);
				},
			);
		})();

		this.tauriListeners.set(
			winId,
			promise,
		);

		try {
			await promise;
		} catch (error) {
			this.tauriListeners.delete(
				winId,
			);

			console.error(
				"[WindowBackend] Tauri listener error:",
				error,
			);
		}
	}

	private receivePacket(
		value: unknown,
	): void {
		if (this.destroyed) return;

		if (!isTransportPacket(value)) {
			return;
		}

		if (
			value.message.type ===
				"system:close" &&
			new URLSearchParams(
					globalThis.location.search,
				).get("winId") ===
				value.winId
		) {
			globalThis.close();
			return;
		}

		this.notifyListeners(value);
	}

	private notifyListeners(
		packet: WindowTransportPacket,
	): void {
		const callbacks = this.listeners.get(
			packet.winId,
		);

		if (!callbacks) return;

		for (
			const callback of [
				...callbacks,
			]
		) {
			try {
				callback(packet);
			} catch (error) {
				console.error(
					"[WindowBackend] Listener error:",
					error,
				);
			}
		}
	}

	// --------------------------------------------------
	// Lifecycle
	// --------------------------------------------------

	private assertAlive(): void {
		if (this.destroyed) {
			throw new Error(
				"WindowBackendManager har förstörts.",
			);
		}
	}

	destroy(): void {
		if (this.destroyed) return;

		this.destroyed = true;

		this.channel?.close();
		this.channel = null;

		if (this.storageListener) {
			globalThis.removeEventListener(
				"storage",
				this.storageListener,
			);

			this.storageListener = null;
		}

		for (
			const promise of this.tauriListeners.values()
		) {
			void promise.then(
				(unlisten) => unlisten(),
			);
		}

		this.tauriListeners.clear();
		this.listeners.clear();

		for (
			const opened of this.openedWindows.values()
		) {
			if (
				opened &&
				!opened.closed
			) {
				opened.close();
			}
		}

		this.openedWindows.clear();
		this.initialMessages.clear();
	}
}

export function createWindowBackend(): WindowBackendManager {
	return new WindowBackendManager();
}
