// src/lib/windowBackend.ts

// winId identifierar en specifik fönsterinstans.

// renderTargetWinId identifierar gruppen/sammanhanget som ska få samma props.

// wManagerId identifierar vilken runtime som äger instanserna.

// BroadcastChannel
//        |
//        v
//   receivePacket()
//        |
//        v
//  isTransportPacket()
//        |
//        v
//  notifyListeners()
//        |
//        +---- winId A -> listeners A
//        |
//        +---- winId B -> listeners B
//        |
//        +---- winId C -> listeners C

import type { WindowId, WindowState } from "./windowManager.svelte";

import type { WindowTarget } from "./windowSync.svelte";

export type WindowMessage =
	| {
		type: "sync:props";
		componentKey?: string;
		renderTargetWinId?: WindowId;
		props: Record<string, unknown>;
	}
	| {
		type: "sync:state-update";
		updates: Partial<WindowState>;
	}
	| {
		type: "rpc:request";
		requestId: string;
		sourceId: string;
		targetEndpointId?: string;
		method: string;
		args: unknown[];
	}
	| {
		type: "rpc:response";
		requestId: string;
		sourceId: string;
		targetEndpointId: string;
		result?: unknown;
		error?: string;
	}
	| { type: "system:close" };
// | {
// 	type: "registry:snapshot";
// 	version: number;
// 	entries: WindowRegistryEntry[];
// };

export interface WindowEndpoint {
	wManagerId: string;
	winId: WindowId;
	parentId: WindowId | null;
}

export type WindowRecipient =
	| { type: "window"; endpoint: WindowEndpoint }
	| {
		type: "group";
		parentId: WindowId | null;
		componentKey: string;
	};

export interface WindowTransportOptions {
	from: WindowEndpoint;
	to: WindowRecipient;
}

export interface WindowTransportPacket {
	from: WindowEndpoint;
	to: WindowRecipient;
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
	wManagerId: string;
	winId: string;
	title: string;
	componentKey: string;
	parentId?: WindowId | null;
	renderTargetWinId?: WindowId | null;

	props: Record<string, unknown>;
	width?: number;
	height?: number;
	left?: number;
	top?: number;
	alwaysOnTop?: boolean; //TODO inför att popoup windows skall ligga först
}

/**
 * The backend routes by the envelope and treats the message payload as opaque.
 */
export type RawMessageCallback = (packet: WindowTransportPacket) => void;

export interface WindowBackend {
	readonly target: Exclude<WindowViewPortType, "workspace">;
	readonly endpointId: string;

	// open(descriptor: ExternalWindowDescriptor, target: WindowViewPortType): Promise<void>;
	open(descriptor: ExternalWindowDescriptor, target: WindowTarget): Promise<void>;

	close(
		winId: string,
		wManagerId: string,
		parentId?: WindowId | null,
		sourceRuntimeId?: string,
	): Promise<void>;
	sendRaw(message: WindowMessage, options: WindowTransportOptions): Promise<void>;

	onRawMessage(winId: string, callback: RawMessageCallback): () => void;
	onGroupMessage(
		parentId: WindowId | null,
		componentKey: string,
		callback: RawMessageCallback,
	): () => void;
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
const TAURI_GROUP_EVENT = `${TAURI_EVENT_PREFIX}group`;

interface WindowRegistryEntry {
	winId: WindowId;
	wMangerId: string;
	renderTargetWinId: WindowId | null;
	wManagerId: string;
	componentKey: string;
}

export class WindowsRegistryService {
	windows = new Map<WindowId, WindowRegistryEntry>();

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

	getChildren(renderTargetWinId: WindowId): WindowRegistryEntry[] {
		return [...this.windows.values()]
			.filter(
				(entry) => entry.renderTargetWinId === renderTargetWinId,
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

function groupListenerKey(parentId: WindowId | null, componentKey: string): string {
	return JSON.stringify([parentId, componentKey]);
}

/**
 * Validerar om ett värde är ett giltigt transportpaket.
 *
 * - Paketet måste vara ett objekt.
 * - Paketet innehåller giltiga avsändar- och mottagarendpoints.
 * - Meddelandet måste ha en giltig type.
 * - Varje meddelandetyp måste ha sina obligatoriska fält.
 *
 * @param value Det okända värde som ska valideras.
 * @returns `true` om värdet uppfyller alla kriterier för en WindowTransportPacket, annars `false`.
 */
function isTransportPacket(
	value: unknown,
): value is WindowTransportPacket {
	if (!value || typeof value !== "object") {
		return false;
	}

	const packet = value as Record<string, unknown>;
	const from = packet.from as Record<string, unknown> | undefined;

	if (
		!from ||
		typeof from.wManagerId !== "string" ||
		typeof from.winId !== "string" ||
		!(
			from.parentId === null ||
			typeof from.parentId === "string"
		) ||
		!packet.to ||
		typeof packet.to !== "object" ||
		!packet.message ||
		typeof packet.message !== "object" ||
		!("type" in packet.message) ||
		typeof packet.message.type !== "string"
	) {
		return false;
	}

	const recipient = packet.to as Record<string, unknown>;
	let recipientEndpoint: Record<string, unknown> | undefined;
	if (recipient.type === "window") {
		const endpoint = recipient.endpoint as Record<string, unknown> | undefined;
		if (
			!endpoint ||
			typeof endpoint.wManagerId !== "string" ||
			typeof endpoint.winId !== "string" ||
			!(
				endpoint.parentId === null ||
				typeof endpoint.parentId === "string"
			)
		) {
			return false;
		}
		recipientEndpoint = endpoint;
	} else if (recipient.type === "group") {
		if (
			!(
				recipient.parentId === null ||
				typeof recipient.parentId === "string"
			) ||
			typeof recipient.componentKey !== "string"
		) {
			return false;
		}
	} else {
		return false;
	}

	const message = packet.message as Record<string, unknown>;

	switch (message.type) {
		case "sync:props":
			if (
				!!message.props &&
				typeof message.props === "object" &&
				!Array.isArray(message.props)
			) {
				if (recipient.type === "group") {
					return typeof message.componentKey === "string" &&
						message.componentKey.length > 0 &&
						recipient.parentId === from.parentId &&
						recipient.componentKey === message.componentKey;
				}
				return recipient.type === "window";
			}
			return false;

		case "sync:state-update":
			return (
				recipient.type === "window" &&
				recipientEndpoint?.winId === from.winId &&
				!!message.updates &&
				typeof message.updates === "object" &&
				!Array.isArray(message.updates)
			);

		case "rpc:request":
			return (
				recipient.type === "window" &&
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
				recipient.type === "window" &&
				typeof message.requestId === "string" &&
				typeof message.sourceId === "string" &&
				typeof message.targetEndpointId === "string" &&
				(
					message.error === undefined ||
					typeof message.error === "string"
				)
			);

		case "system:close":
			return recipient.type === "window";

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
	private groupListeners = new Map<string, Set<RawMessageCallback>>();

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
		const params = new URLSearchParams(globalThis.location.search);
		const winId = params.get("winId");
		const wManagerId = params.get("wManagerId");

		if (!winId) return;

		queueMicrotask(() => {
			if (this.destroyed) return;

			try {
				const key = initStorageKey(winId);

				const raw = localStorage.getItem(key);

				if (!raw) return;

				const props = JSON.parse(raw) as Record<string, unknown>;
				if (!props || typeof props !== "object" || Array.isArray(props)) {
					throw new Error("Initial window props must be an object.");
				}
				if (!wManagerId) {
					throw new Error("Initial window state is missing wManagerId.");
				}

				localStorage.removeItem(key);

				const parentId = params.get("parentId");
				const endpoint: WindowEndpoint = {
					wManagerId,
					winId,
					parentId,
				};
				const packet: WindowTransportPacket = {
					from: endpoint,
					to: { type: "window", endpoint },
					message: {
						type: "sync:props",
						componentKey: params.get("componentKey") ?? undefined,
						renderTargetWinId: params.get("renderTargetWinId") ??
							parentId ??
							undefined,
						props,
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
		// target: WindowViewPortType,
		target: WindowTarget,
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

			default:
				const _exhaustive: never = target;
				throw new Error(
					`Okänt fönster-target: ${String(_exhaustive)}`,
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
		url.searchParams.set("wManagerId", descriptor.wManagerId);

		if (descriptor.parentId) {
			url.searchParams.set("parentId", descriptor.parentId);
		}

		if (descriptor.renderTargetWinId) {
			url.searchParams.set("renderTargetWinId", descriptor.renderTargetWinId);
		}
		return url;
	}

	private saveInitialState(
		descriptor: ExternalWindowDescriptor,
	): void {
		try {
			localStorage.setItem(
				initStorageKey(descriptor.winId),
				JSON.stringify(descriptor.props ?? {}),
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
			wManagerId,
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
			wManagerId,
		});

		if (descriptor.renderTargetWinId) {
			params.set(
				"renderTargetWinId",
				descriptor.renderTargetWinId,
			);
		}
		if (descriptor.parentId) {
			params.set("parentId", descriptor.parentId);
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
		wManagerId: string,
		parentId: string | null = null,
		sourceRuntimeId = wManagerId,
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

		const endpoint = { winId, wManagerId, parentId };
		await this.sendRaw(
			{ type: "system:close" },
			{
				from: { ...endpoint, wManagerId: sourceRuntimeId },
				to: { type: "window", endpoint },
			},
		);
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
		options: WindowTransportOptions,
	): Promise<void> {
		this.assertAlive();

		const packet: WindowTransportPacket = {
			from: options.from,
			to: options.to,
			message,
		};

		if (this.target === "tauri-window") {
			const modulePath = "@tauri-apps/api/event";
			const api = await import(/* @vite-ignore */ modulePath) as TauriEventApi;
			await api.emit(
				options.to.type === "group"
					? TAURI_GROUP_EVENT
					: tauriEventName(options.to.endpoint.winId),
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

		if (this.target === "tauri-window") {
			void this.ensureTauriListener(winId);
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

	onGroupMessage(
		parentId: WindowId | null,
		componentKey: string,
		callback: RawMessageCallback,
	): () => void {
		this.assertAlive();

		const key = groupListenerKey(parentId, componentKey);
		let callbacks = this.groupListeners.get(key);
		if (!callbacks) {
			callbacks = new Set();
			this.groupListeners.set(key, callbacks);
		}
		callbacks.add(callback);

		if (this.target === "tauri-window") {
			void this.ensureTauriGroupListener();
		}

		return () => {
			const current = this.groupListeners.get(key);
			if (!current) return;
			current.delete(callback);
			if (current.size === 0) this.groupListeners.delete(key);
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

	private async ensureTauriGroupListener(): Promise<void> {
		if (this.tauriListeners.has(TAURI_GROUP_EVENT)) {
			await this.tauriListeners.get(TAURI_GROUP_EVENT);
			return;
		}

		const modulePath = "@tauri-apps/api/event";
		const promise = (async () => {
			const api = await import(
				/* @vite-ignore */ modulePath
			) as TauriEventApi;
			return api.listen(TAURI_GROUP_EVENT, (event) => {
				this.receivePacket(event.payload);
			});
		})();

		this.tauriListeners.set(TAURI_GROUP_EVENT, promise);
		try {
			await promise;
		} catch (error) {
			this.tauriListeners.delete(TAURI_GROUP_EVENT);
			console.error("[WindowBackend] Tauri group listener error:", error);
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
			value.to.type === "window" &&
			new URLSearchParams(globalThis.location.search).get("winId") === value.to.endpoint.winId
		) {
			globalThis.close();
			return;
		}

		this.notifyListeners(value);
	}

	private notifyListeners(
		packet: WindowTransportPacket,
	): void {
		const callbacks = packet.to.type === "group"
			? this.groupListeners.get(
				groupListenerKey(packet.to.parentId, packet.to.componentKey),
			)
			: this.listeners.get(packet.to.endpoint.winId);

		if (!callbacks) {
			return;
		}

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
		this.groupListeners.clear();

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
