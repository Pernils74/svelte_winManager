// src/lib/windowBackend.ts

import type { WindowId, WindowState } from "./windowManager.svelte";

export interface DetachedWindowState {
	payload: unknown;
	props: Record<string, unknown>;
}

export type WindowMessage =
	| { type: "sync:payload"; winId: WindowId; state: DetachedWindowState }
	| { type: "sync:state-update"; winId: WindowId; updates: Partial<WindowState> }
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
	| { type: "system:close"; winId: WindowId };

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
	payload: unknown;
	props: Record<string, unknown>;
	width?: number;
	height?: number;
	left?: number;
	top?: number;
}

export interface DetachedWindowState {
	payload: unknown;
	props: Record<string, unknown>;
}

/**
 * Transportpaket.
 *
 * Broker tolkar aldrig data.
 */
export interface WindowTransportPacket {
	winId: string;
	sourceId: string;
	data: unknown;
}

export type RawMessageCallback = (
	packet: WindowTransportPacket,
) => void;

export interface WindowBackend {
	readonly target: Exclude<
		WindowViewPortType,
		"workspace"
	>;

	readonly endpointId: string;

	open(
		descriptor: ExternalWindowDescriptor,
		target: WindowViewPortType,
	): Promise<void>;

	close(winId: string): Promise<void>;

	sendRaw(
		winId: string,
		data: unknown,
	): Promise<void>;

	onRawMessage(
		winId: string,
		callback: RawMessageCallback,
	): () => void;

	destroy(): void;
}

interface TauriEventApi {
	emit(
		event: string,
		payload: unknown,
	): Promise<void>;

	listen(
		event: string,
		handler: (event: {
			payload: unknown;
		}) => void,
	): Promise<() => void>;
}

interface TauriWebviewWindow {
	label: string;
	close(): Promise<void>;
}

interface TauriWebviewWindowApi {
	WebviewWindow: new (
		label: string,
		options: Record<string, unknown>,
	) => {
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

	return (
		typeof packet.winId === "string" &&
		typeof packet.sourceId === "string" &&
		"data" in packet
	);
}

function isDetachedState(
	value: unknown,
): value is DetachedWindowState {
	if (!value || typeof value !== "object") {
		return false;
	}

	const state = value as Record<string, unknown>;

	return (
		"payload" in state &&
		"props" in state &&
		typeof state.props === "object" &&
		state.props !== null &&
		!Array.isArray(state.props)
	);
}

export class WindowBackendManager implements WindowBackend {
	readonly target: Exclude<
		WindowViewPortType,
		"workspace"
	>;

	readonly endpointId = createId();

	private channel: BroadcastChannel | null = null;

	private listeners = new Map<
		string,
		Set<RawMessageCallback>
	>();

	private openedWindows = new Map<
		string,
		Window | null
	>();

	private tauriListeners = new Map<
		string,
		Promise<() => void>
	>();

	private storageListener:
		| ((event: StorageEvent) => void)
		| null = null;

	private destroyed = false;

	constructor() {
		this.target = isTauri() ? "tauri-window" : "browser-tab";

		if (!isBrowser()) return;

		if (this.target === "browser-tab") {
			this.initializeBrowserTransport();
		}
	}

	// --------------------------------------------------
	// Browser transport
	// --------------------------------------------------

	private initializeBrowserTransport(): void {
		if (
			typeof BroadcastChannel !== "undefined"
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

				const state: unknown = JSON.parse(raw);

				localStorage.removeItem(key);

				if (!isDetachedState(state)) {
					console.error(
						"[WindowBackend] Invalid initial state.",
					);
					return;
				}

				this.notifyListeners({
					winId,
					sourceId: "initial-state",
					data: {
						kind: "sync",
						state,
					},
				});
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
			throw new Error("winId saknas.");
		}

		if (!descriptor.componentKey) {
			throw new Error("componentKey saknas.");
		}

		switch (target) {
			case "browser-tab":
				this.openBrowserTab(descriptor);
				return;

			case "browser-window":
				this.openBrowserWindow(descriptor);
				return;

			case "tauri-window":
				await this.openTauriWindow(descriptor);
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
		const url = new URL(
			globalThis.location.href,
		);

		url.searchParams.set(
			"winId",
			descriptor.winId,
		);

		url.searchParams.set(
			"componentKey",
			descriptor.componentKey,
		);

		url.searchParams.set(
			"title",
			descriptor.title,
		);

		return url;
	}

	private saveInitialState(
		descriptor: ExternalWindowDescriptor,
	): void {
		const state: DetachedWindowState = {
			payload: descriptor.payload,
			props: descriptor.props ?? {},
		};

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
		const url = this.buildDetachedUrl(descriptor);

		this.saveInitialState(descriptor);

		const tab = globalThis.open(
			url.toString(),
			`_blank_${descriptor.winId}`,
		);

		if (!tab) {
			localStorage.removeItem(
				initStorageKey(descriptor.winId),
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

	private openBrowserWindow(
		descriptor: ExternalWindowDescriptor,
	): void {
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

	async close(winId: string): Promise<void> {
		this.assertAlive();

		if (this.target === "tauri-window") {
			await this.closeTauriWindow(winId);
			return;
		}

		const opened = this.openedWindows.get(winId);

		if (opened && !opened.closed) {
			opened.close();
			this.openedWindows.delete(winId);
			return;
		}

		await this.sendRaw(winId, {
			kind: "window:close",
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
			(item) => item.label === `detached-${winId}`,
		);

		if (target) {
			await target.close();
		}
	}

	// --------------------------------------------------
	// Raw transport
	// --------------------------------------------------

	async sendRaw(
		winId: string,
		data: unknown,
	): Promise<void> {
		this.assertAlive();

		if (!winId) {
			throw new Error(
				"sendRaw kräver ett winId.",
			);
		}

		const packet: WindowTransportPacket = {
			winId,
			sourceId: this.endpointId,
			data,
		};

		if (this.target === "tauri-window") {
			const modulePath = "@tauri-apps/api/event";

			const api = await import(
				/* @vite-ignore */ modulePath
			) as TauriEventApi;

			await api.emit(
				tauriEventName(winId),
				packet,
			);

			return;
		}

		if (this.channel) {
			this.channel.postMessage(packet);
			return;
		}

		this.sendStoragePacket(packet);
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

			localStorage.removeItem(key);
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
			this.listeners.set(winId, callbacks);
		}

		callbacks.add(callback);

		if (this.target === "tauri-window") {
			void this.ensureTauriListener(winId);
		}

		return () => {
			const current = this.listeners.get(winId);

			if (!current) return;

			current.delete(callback);

			if (current.size === 0) {
				this.listeners.delete(winId);
			}
		};
	}

	private async ensureTauriListener(
		winId: string,
	): Promise<void> {
		if (this.tauriListeners.has(winId)) {
			await this.tauriListeners.get(winId);
			return;
		}

		const modulePath = "@tauri-apps/api/event";

		const promise = (async () => {
			const api = await import(
				/* @vite-ignore */ modulePath
			) as TauriEventApi;

			return api.listen(
				tauriEventName(winId),
				(event) => {
					this.receivePacket(event.payload);
				},
			);
		})();

		this.tauriListeners.set(winId, promise);

		try {
			await promise;
		} catch (error) {
			this.tauriListeners.delete(winId);
			console.error(
				"[WindowBackend] Tauri listener error:",
				error,
			);
		}
	}

	private receivePacket(value: unknown): void {
		if (this.destroyed) return;

		if (!isTransportPacket(value)) return;

		this.notifyListeners(value);
	}

	private notifyListeners(
		packet: WindowTransportPacket,
	): void {
		const callbacks = this.listeners.get(packet.winId);

		if (!callbacks) return;

		for (const callback of [...callbacks]) {
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

		for (const promise of this.tauriListeners.values()) {
			void promise.then(
				(unlisten) => unlisten(),
			);
		}

		this.tauriListeners.clear();
		this.listeners.clear();

		for (const opened of this.openedWindows.values()) {
			if (opened && !opened.closed) {
				opened.close();
			}
		}

		this.openedWindows.clear();
	}
}

export function createWindowBackend(): WindowBackendManager {
	return new WindowBackendManager();
}
