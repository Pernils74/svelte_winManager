// src/lib/windowBackend.ts

// Längst upp i din fil (eller i funktionen) kan du importera SvelteKits base path:
//  import { base } from "$app/paths";

export type WindowTarget = "internal" | "tab" | "window" | "tauri";

export interface ExternalWindowDescriptor {
	winId: string;
	title: string;
	componentKey: string;
	payload: unknown;
	props: Record<string, unknown>;
	// sizes
	width?: number;
	height?: number;
	left?: number;
	top?: number;
}

export interface DetachedWindowState {
	payload: unknown;
	props: Record<string, unknown>;
}

export interface WindowBackend {
	readonly target: Exclude<WindowTarget, "internal">;

	open(window: ExternalWindowDescriptor, target: WindowTarget): Promise<void>;
	close(winId: string): Promise<void>;
	// send(
	//   winId: string,
	//   payload: unknown,
	//   props?: Record<string, unknown>,
	// ): Promise<void>;
	send(
		winId: string,
		state: DetachedWindowState,
	): Promise<void>;

	onMessage(
		winId: string,
		callback: (state: DetachedWindowState) => void,
	): () => void;

	destroy(): void;
}

// type MessageCallback = (payload: unknown) => void;
type MessageCallback = (state: DetachedWindowState) => void;

// type BrowserMessage =
//   | {
//     winId: string;
//     type: "payload:update";
//     payload: unknown;
//   }
//   | {
//     winId: string;
//     type: "props:update";
//     props: Record<string, unknown>;
//   }
//   | {
//     winId: string;
//     type: "window:close";
//   };

// type BrowserMessage =
// 	| {
// 		winId: string;
// 		// type: "payload:update" | "payload:init";
// 		type: "state:update";
// 		state: DetachedWindowState;
// 	}
// 	| {
// 		winId: string;
// 		type: "window:close";
// 	};

// Lägg till i BrowserMessage-typen i src/lib/windowBackend.ts
type BrowserMessage =
	| { winId: string; type: "state:update"; state: DetachedWindowState }
	| { winId: string; type: "window:close" }
	| {
		winId: string;
		type: "callback:invoke";
		callbackId: string;
		args: any[];
		replyId?: string; // För asynkron returdata (Promises)
	}
	| {
		winId: string;
		type: "callback:reply";
		replyId: string;
		value?: any;
		error?: string;
	};

const CHANNEL_NAME = "svelte_winmanager_channel";

const isTauri = (): boolean =>
	typeof window !== "undefined" &&
	"__TAURI_INTERNALS__" in window;

const isBrowser = (): boolean => typeof window !== "undefined";

const initStorageKey = (winId: string): string => `win_payload_init_${winId}`;

/**
 * Gemensam backend för frikopplade fönster.
 *
 * Väljer automatiskt:
 * - TauriWindowBackend i Tauri.
 * - BrowserTabBackend i en vanlig webbläsare.
 *
 * I ett fönster som redan är frikopplat används samma backend
 * för att ta emot initial payload och senare uppdateringar.
 */
export class WindowBackendManager implements WindowBackend {
	readonly target: Exclude<WindowTarget, "internal">;

	private listeners = new Map<string, Set<MessageCallback>>();
	private openedWindows = new Map<string, Window | null>();

	private channel: BroadcastChannel | null = null;
	private unlistenFunctions = new Map<string, () => void>();

	private destroyed = false;
	private initListenerPromise: Promise<void> | null = null;

	// Leta upp din constructor i WindowBackendManager och uppdatera till detta:
	constructor() {
		this.target = isTauri() ? "tauri" : "tab";

		if (this.target === "tab" && isBrowser()) {
			if (typeof BroadcastChannel !== "undefined") {
				this.channel = new BroadcastChannel(CHANNEL_NAME);
				this.channel.onmessage = (event: MessageEvent<BrowserMessage>) => {
					this.handleBrowserMessage(event.data);
				};
			}

			// 🟢 NYTT FÖR WEBBLÄSARFLIKAR: Läs av initial data från localStorage vid boot
			const currentWinId = new URLSearchParams(globalThis.location.search).get(
				"winId",
			);
			if (currentWinId) {
				// Använd queueMicrotask eller kort timeout så Svelte hinner binda onMessage först
				queueMicrotask(() => {
					const storageKey = initStorageKey(currentWinId);
					const rawInitPayload = localStorage.getItem(storageKey);
					if (rawInitPayload) {
						try {
							const parsed = JSON.parse(rawInitPayload);
							// Skicka ut datan till den lokala lyssnaren i den nya fliken
							// this.notifyListeners(currentWinId, parsed);
							// this.notifyListeners(currentWinId, parsed.payload, parsed.props);
							this.notifyListeners(
								currentWinId,
								{
									payload: parsed.payload,
									props: parsed.props ?? {},
								},
							);

							localStorage.removeItem(storageKey); // Städning!
						} catch (e) {
							console.error(
								"[WindowBackend] Misslyckades att parsa initial localStorage-payload",
								e,
							);
						}
					}
				});
			}
		}

		if (this.target === "tauri") {
			this.initListenerPromise = this.initTauriListeners();
		}
	}

	async open(
		descriptor: ExternalWindowDescriptor,
		target: WindowTarget,
	): Promise<void> {
		if (this.destroyed) {
			throw new Error("WindowBackendManager har redan förstörts.");
		}

		if (!descriptor.winId || !descriptor.componentKey) {
			throw new Error("winId och componentKey krävs.");
		}

		if (target === "tauri") {
			await this.openTauri(descriptor);
			return;
		}

		if (target === "window") {
			this.openBrowserWindow(descriptor);
			return;
		}

		if (target === "tab") {
			this.openBrowserTab(descriptor);
			return;
		}

		throw new Error(`Unsupported target: ${target}`);
	}

	/**
	 * Stänger ett externt fönster.
	 */
	async close(winId: string): Promise<void> {
		if (this.target === "tauri") {
			try {
				// 1. Skapa en variabel för strängen. Detta döljer importen för Vite/Rollup under bygget!
				const modulePath = "@tauri-apps/api/webviewWindow";

				// 2. Gör importen via variabeln
				const { getAllWebviewWindows } = await import(
					/* @vite-ignore */ modulePath
				);

				const label = `detached-${winId}`;
				const windows = await getAllWebviewWindows();
				// const targetWindow = windows.find((item) => item.label === label);
				const targetWindow = windows.find(
					(item: { label: string; close: () => Promise<void> }) => item.label === label,
				);

				if (targetWindow) {
					await targetWindow.close();
				}
			} catch (error) {
				console.error(
					`[WindowBackend] Kunde inte stänga Tauri-fönster ${winId}:`,
					error,
				);
			}

			return;
		}

		const tab = this.openedWindows.get(winId);

		if (tab && !tab.closed) {
			tab.close();
			this.openedWindows.delete(winId);
			return;
		}

		this.postBrowserMessage({
			winId,
			type: "window:close",
		});
	}

	/**
	 * Skickar uppdaterad payload till det frikopplade fönstret.
	 */

	async send(
		winId: string,
		state: DetachedWindowState,
	): Promise<void> {
		if (this.target === "tauri") {
			try {
				// Göm strängen för byggverktyget (Vite/Rollup)
				const eventPath = "@tauri-apps/api/event";
				const { emit } = await import(/* @vite-ignore */ eventPath);
				await emit(`sync-payload-${winId}`, {
					payload: state.payload,
					props: state.props,
				});
			} catch (error) {
				console.error(
					`[WindowBackend] Kunde inte skicka payload till ${winId}:`,
					error,
				);
			}

			return;
		}

		// this.postBrowserMessage({
		//   winId,
		//   type: "payload:update",
		//   payload,
		//   props,
		// });
		this.postBrowserMessage({
			winId,
			type: "state:update",
			state,
		});
	}

	/**
	 * Lyssnar på payload från ett externt fönster.
	 *
	 * Returnerar en funktion för att avregistrera lyssnaren.
	 */
	onMessage(
		winId: string,
		callback: MessageCallback, //  (payload: unknown) => void,
	): () => void {
		let callbacks = this.listeners.get(winId);

		if (!callbacks) {
			callbacks = new Set();
			this.listeners.set(winId, callbacks);
		}
		callbacks.add(callback);

		// Återspela initialpayloaden om den redan har kommit.
		// if (this.latestPayloads.has(winId)) {
		//   callback(this.latestPayloads.get(winId));
		// }
		if (this.latestStates.has(winId)) {
			callback(this.latestStates.get(winId)!);
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

	/**
	 * Frigör resurser när backend inte längre behövs.
	 */
	destroy(): void {
		if (this.destroyed) return;

		this.destroyed = true;

		this.channel?.close();
		this.channel = null;

		for (const unlisten of this.unlistenFunctions.values()) unlisten();

		this.unlistenFunctions.clear();
		this.listeners.clear();
		this.openedWindows.clear();
	}

	// --------------------------------------------------
	// Browser-tab backend
	// --------------------------------------------------

	private buildDetachedUrl(winId: string, componentKey: string, title: string): URL {
		const url = new URL(globalThis.location.href);
		const currentPath = globalThis.location.pathname;
		const projectBase = currentPath.substring(
			0,
			currentPath.indexOf("/", 1) + 1,
		);
		url.pathname = globalThis.location.hostname.includes("github.io") ? projectBase : "/";
		url.searchParams.set("winId", winId);
		url.searchParams.set("componentKey", componentKey);
		url.searchParams.set("title", title);
		return url;
	}

	private saveInitState(winId: string, payload: unknown, props: Record<string, unknown>): void {
		try {
			localStorage.setItem(
				initStorageKey(winId),
				JSON.stringify({ payload, props }),
			);
		} catch (error) {
			console.error(`[WindowBackend] Kunde inte spara initial payload för ${winId}:`, error);

			throw error;
		}
	}

	private openBrowserTab(descriptor: ExternalWindowDescriptor): void {
		const { winId, title, componentKey, payload, props } = descriptor;
		const url = this.buildDetachedUrl(winId, componentKey, title);
		this.saveInitState(winId, payload, props);
		const tab = globalThis.open(url.toString(), `_blank_${winId}`);

		if (!tab) {
			localStorage.removeItem(initStorageKey(winId));

			throw new Error("Webbläsaren blockerade den nya fliken. Tillåt popup-fönster för sidan.");
		}

		this.openedWindows.set(winId, tab);
	}

	private openBrowserWindow(
		descriptor: ExternalWindowDescriptor,
	): void {
		const {
			winId,
			title,
			componentKey,
			payload,
			props,

			width = 1000,
			height = 700,
			left = 100,
			top = 100,
		} = descriptor;

		const url = this.buildDetachedUrl(winId, componentKey, title);

		this.saveInitState(winId, payload, props);

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
			localStorage.removeItem(initStorageKey(winId));

			throw new Error(
				"Webbläsaren blockerade popup-fönstret. Tillåt popup-fönster för sidan.",
			);
		}

		this.openedWindows.set(winId, popup);
	}

	private postBrowserMessage(message: BrowserMessage): void {
		if (!this.channel) {
			console.warn(
				"[WindowBackend] BroadcastChannel stöds inte i den här miljön.",
			);
			return;
		}
		this.channel.postMessage(message);
	}

	private handleBrowserMessage(message: BrowserMessage): void {
		if (!message?.winId || !message.type) return;

		if (message.type === "window:close") {
			const currentWinId = new URLSearchParams(globalThis.location.search).get(
				"winId",
			);
			if (currentWinId === message.winId) {
				globalThis.close();
			}
			return;
		}
		if (message.type === "state:update") { //|| message.type === "payload:init") {
			this.notifyListeners(message.winId, message.state);
		}

		// Inuti handleBrowserMessage(message: BrowserMessage)
		if (message.type === "callback:invoke") {
			// Om vi är i huvudappen (Host context)
			const registry = (globalThis as any).__callbackRegistry;
			if (registry && registry.has(message.callbackId)) {
				const fn = registry.get(message.callbackId);
				Promise.resolve()
					.then(() => fn(...message.args))
					.then((result) => {
						if (message.replyId) {
							this.postBrowserMessage({
								winId: message.winId,
								type: "callback:reply",
								replyId: message.replyId,
								value: result,
							});
						}
					})
					.catch((err) => {
						if (message.replyId) {
							this.postBrowserMessage({
								winId: message.winId,
								type: "callback:reply",
								replyId: message.replyId,
								error: err.message || String(err),
							});
						}
					});
			}
			return;
		}

		if (message.type === "callback:reply") {
			const handler = (globalThis as any).__replyHandlers?.get(message.replyId);
			if (handler) {
				if (message.error) handler.reject(new Error(message.error));
				else handler.resolve(message.value);
				(globalThis as any).__replyHandlers.delete(message.replyId);
			}
			return;
		}
	}

	// --------------------------------------------------
	// Tauri backend
	// --------------------------------------------------

	private async openTauri(
		descriptor: ExternalWindowDescriptor,
	): Promise<void> {
		const { winId, title, componentKey, payload, props } = descriptor;

		// Säkra importen genom att gömma strängen för byggverktyget
		const webviewWindowPath = "@tauri-apps/api/webviewWindow";
		const { WebviewWindow } = await /* @vite-ignore */ import(
			webviewWindowPath
		);

		const params = new URLSearchParams({
			winId,
			componentKey,
			title,
		});

		const tauriWindow = new WebviewWindow(
			`detached-${winId}`,
			{
				url: `index.html?${params.toString()}`,
				title,
				width: 800,
				height: 600,
				decorations: true,
			},
		);

		await new Promise<void>((resolve, reject) => {
			let settled = false;

			tauriWindow.once("tauri://created", () => {
				settled = true;
				resolve();
			});

			tauriWindow.once("tauri://error", (event: any) => {
				settled = true;
				reject(event.payload);
			});

			// Förhindra att ett oväntat eventfel lämnar ett ouppklarat löfte.
			void Promise.resolve().then(() => {
				if (settled) return;
			});
		});

		// Small timeout so the window can settle
		setTimeout(async () => {
			try {
				const eventPath = "@tauri-apps/api/event";
				const { emit } = await import(/* @vite-ignore */ eventPath);
				// await emit(`init-payload-${winId}`, payload);
				await emit(
					`init-payload-${winId}`,
					{
						payload,
						props,
					},
				);
			} catch (error) {
				console.error(
					"[WindowBackend] Kunde inte skicka init-payload till Tauri",
					error,
				);
			}
		}, 150);
	}

	private async initTauriListeners(): Promise<void> {
		if (!isTauri()) return;

		const winId = new URLSearchParams(
			globalThis.location.search,
		).get("winId");

		if (!winId) return;

		try {
			// Göm strängen för byggverktyget (Vite/Rollup) så det går att bygga för enbart webb
			const eventPath = "@tauri-apps/api/event";
			const { listen } = await import(/* @vite-ignore */ eventPath);

			const unlistenInit = await listen(
				`init-payload-${winId}`,
				(event: any) => {
					const data = event.payload;
					if (data && typeof data === "object" && "payload" in data) {
						this.notifyListeners(
							winId,
							data as DetachedWindowState,
						);
					} else {
						this.notifyListeners(winId, {
							payload: data,
							props: {},
						});
					}
					unlistenInit();
				},
			);

			const unlistenSync = await listen(
				`sync-payload-${winId}`,
				(event: any) => {
					const data = event.payload;
					if (data && typeof data === "object" && "payload" in data) {
						this.notifyListeners(
							winId,
							data as DetachedWindowState,
						);
					} else {
						this.notifyListeners(winId, {
							payload: data,
							props: {},
						});
						// this.notifyListeners(winId, data);
					}
				},
			);

			this.unlistenFunctions.set(winId, () => {
				unlistenInit();
				unlistenSync();
			});
		} catch (error) {
			console.error(
				"[WindowBackend] Kunde inte initiera Tauri-lyssnare:",
				error,
			);
		}
	}

	// --------------------------------------------------
	// Shared helpers
	//
	// --------------------------------------------------

	private latestStates = new Map<string, DetachedWindowState>();

	private notifyListeners(
		winId: string,
		state: DetachedWindowState,
	): void {
		this.latestStates.set(winId, state);
		const callbacks = this.listeners.get(winId);
		if (!callbacks) return;
		for (const callback of callbacks) {
			callback(state);
		}
	}
}

/**
 * Fabrik för att skapa backend.
 */
//
export function createWindowBackend(): WindowBackendManager {
	return new WindowBackendManager();
}
