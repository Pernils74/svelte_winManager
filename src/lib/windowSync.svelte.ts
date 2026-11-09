import type { ExternalWindowDescriptor, WindowBackend, WindowMessage, WindowTransportPacket } from "./windowBackend";

import type { WindowId, WindowInstance, WindowManager, WindowState } from "./windowManager.svelte";
import { createRpcTransport, WindowRpc } from "./windowRpc";

import { ROOT_WIN_ID } from "./windowManager.svelte";
// --------------------------------------------------
// TYPES
// --------------------------------------------------
export type WindowTarget =
	| "browser-tab"
	| "browser-window"
	| "tauri-window";

type ReadProps = () => Record<string, unknown>;

type ApplyProps = (props: Record<string, unknown>) => void;

interface SyncSession {
	stopEffect: () => void;
	unsubscribe: () => void;
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function snapshot<T>(value: T): T {
	return $state.snapshot(value) as T;
}

/**
 * Jämför strukturerade värden utan JSON.stringify.
 *
 * Optimerad för JSON-kompatibla props.
 */
function deepEqual(
	a: unknown,
	b: unknown,
	seen = new WeakMap<object, WeakSet<object>>(),
): boolean {
	if (Object.is(a, b)) return true;

	if (
		a === null ||
		b === null ||
		typeof a !== "object" ||
		typeof b !== "object"
	) {
		return false;
	}

	if (
		Object.getPrototypeOf(a) !==
			Object.getPrototypeOf(b)
	) {
		return false;
	}

	const objectA = a as object;
	const objectB = b as object;

	let paired = seen.get(objectA);

	if (paired?.has(objectB)) {
		return true;
	}

	if (!paired) {
		paired = new WeakSet<object>();
		seen.set(objectA, paired);
	}

	paired.add(objectB);

	// Date
	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime();
	}

	// RegExp
	if (a instanceof RegExp && b instanceof RegExp) {
		return (
			a.source === b.source &&
			a.flags === b.flags
		);
	}

	// ArrayBuffer
	if (
		a instanceof ArrayBuffer &&
		b instanceof ArrayBuffer
	) {
		if (a.byteLength !== b.byteLength) {
			return false;
		}

		const bytesA = new Uint8Array(a);
		const bytesB = new Uint8Array(b);

		for (let i = 0; i < bytesA.length; i++) {
			if (bytesA[i] !== bytesB[i]) {
				return false;
			}
		}

		return true;
	}

	// TypedArrays / DataView
	if (
		ArrayBuffer.isView(a) &&
		ArrayBuffer.isView(b)
	) {
		if (a.constructor !== b.constructor) {
			return false;
		}

		const viewA = a as unknown as {
			length?: number;
			[index: number]: number;
			byteLength: number;
			buffer: ArrayBufferLike;
			byteOffset: number;
		};

		const viewB = b as unknown as {
			length?: number;
			[index: number]: number;
			byteLength: number;
			buffer: ArrayBufferLike;
			byteOffset: number;
		};

		if (viewA.byteLength !== viewB.byteLength) {
			return false;
		}

		if (
			viewA.length !== undefined &&
			viewB.length !== undefined
		) {
			for (let i = 0; i < viewA.length; i++) {
				if (viewA[i] !== viewB[i]) {
					return false;
				}
			}

			return true;
		}

		const bytesA = new Uint8Array(
			viewA.buffer,
			viewA.byteOffset,
			viewA.byteLength,
		);

		const bytesB = new Uint8Array(
			viewB.buffer,
			viewB.byteOffset,
			viewB.byteLength,
		);

		for (let i = 0; i < bytesA.length; i++) {
			if (bytesA[i] !== bytesB[i]) {
				return false;
			}
		}

		return true;
	}

	// Map
	if (a instanceof Map && b instanceof Map) {
		if (a.size !== b.size) return false;

		for (const [key, value] of a) {
			if (!b.has(key)) return false;

			if (!deepEqual(value, b.get(key), seen)) {
				return false;
			}
		}

		return true;
	}

	// Set
	if (a instanceof Set && b instanceof Set) {
		if (a.size !== b.size) return false;

		for (const value of a) {
			if (!b.has(value)) return false;
		}

		return true;
	}

	// Arrays / Objects
	const keysA = Reflect.ownKeys(objectA);
	const keysB = Reflect.ownKeys(objectB);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (const key of keysA) {
		if (!Object.prototype.hasOwnProperty.call(objectB, key)) {
			return false;
		}

		if (
			!deepEqual((objectA as Record<PropertyKey, unknown>)[key], (objectB as Record<PropertyKey, unknown>)[key], seen)
		) {
			return false;
		}
	}

	return true;
}

// --------------------------------------------------
// MESSAGE VALIDATION
// --------------------------------------------------

function isWindowStateUpdateMessage(
	value: WindowMessage,
	winId: string,
): value is Extract<WindowMessage, { type: "sync:state-update" }> {
	if (
		value.type !== "sync:state-update" ||
		value.winId !== winId
	) {
		return false;
	}

	const numericKeys = new Set([
		"left",
		"top",
		"width",
		"height",
		"transparency",
	]);

	const booleanKeys = new Set([
		"isMinimized",
		"isMaximized",
		"isFocused",
	]);

	if (
		!value.updates ||
		typeof value.updates !== "object"
	) {
		return false;
	}

	return Object.entries(
		value.updates as Record<string, unknown>,
	).every(([key, item]) => {
		if (numericKeys.has(key)) {
			return (
				typeof item === "number" &&
				Number.isFinite(item)
			);
		}

		return (
			booleanKeys.has(key) &&
			typeof item === "boolean"
		);
	});
}

function restoreRpcToCallbacks(obj: any, rpc?: any): any {
	if (!obj || typeof obj !== "object") return obj;

	for (const key of Object.keys(obj)) {
		const value = obj[key];
		if (typeof value === "string" && value.startsWith("__RPC_CALLBACK__:")) {
			const rpcMethodName = value.split("__RPC_CALLBACK__:")[1];

			// 🌟 MAGIC: Ge komponenten en fungerande RPC-metod tillbaka!
			obj[key] = async (...args: unknown[]) => {
				if (!rpc) {
					console.warn(`📡 [Auto-RPC] Kunde inte anropa master-callback "${rpcMethodName}" eftersom RPC saknas.`);
					return;
				}
				console.log(`📡 [Auto-RPC] Anropar master-callback: ${rpcMethodName}`);
				return rpc.call(`callback:${rpcMethodName}`, ...args);
			};
		} else if (typeof value === "object") {
			restoreRpcToCallbacks(value, rpc);
		}
	}
	return obj;
}

// --------------------------------------------------
// WINDOW SYNC
// --------------------------------------------------

export class WindowSync {
	private readonly sessions = new Map<
		string,
		SyncSession
	>();

	private destroyed = false;

	private readonly rpcInstances = new Map<string, WindowRpc>();
	private readonly rpcManagerIds = new Map<string, string>();

	private getRpc(
		winId: string,
		wManagerId: string | (() => string),
	): WindowRpc {
		let rpc = this.rpcInstances.get(winId);
		const managerId = typeof wManagerId === "function" ? wManagerId() : wManagerId;

		if (
			rpc &&
			this.rpcManagerIds.get(winId) !== managerId
		) {
			rpc.destroy();
			this.rpcInstances.delete(winId);
			rpc = undefined;
		}

		if (!rpc) {
			const transport = createRpcTransport(this.backend);
			rpc = new WindowRpc(transport, winId, { wManagerId });
			this.rpcInstances.set(winId, rpc);
			this.rpcManagerIds.set(winId, managerId);
		}

		return rpc;
	}

	constructor(
		private readonly backend: WindowBackend,
	) {}

	// ----------------------------------------------
	// OPEN
	// ----------------------------------------------

	/**
	 * Öppnar ett externt fönster.
	 *
	 * Snapshot säkerställer att reaktiva proxies
	 * inte lämnar aktuell runtime.
	 */
	async open(
		descriptor: ExternalWindowDescriptor,
		target: WindowTarget,
	): Promise<void> {
		this.assertAlive();

		const cleanDescriptor = snapshot({
			...descriptor,
			props: descriptor.props ?? {},
		});

		await this.backend.open(
			cleanDescriptor,
			target,
		);
	}

	// winId
	//   = unik fönsterinstans

	// componentKey
	//   = vilken komponenttyp som renderas

	// renderTargetWinId
	//   = synkgrupp mellan instanser

	// wManagerId
	//   = vilken runtime instansen tillhör

	// endpointId
	//   = vilken backend-instans som skickade paketet

	// ----------------------------------------------
	// START
	// ----------------------------------------------

	/**
	 * Startar dubbelriktad props-synkronisering.
	 *
	 * readProps:
	 * Läser aktuella reaktiva props.
	 *
	 * applyProps:
	 * Applicerar inkommande props.
	 *
	 * applyWindowStateUpdate:
	 * Applicerar inkommande fönstergeometri/state.
	 */
	start(
		win: WindowInstance,
		readProps: ReadProps,
		applyState: ApplyProps,
		applyWindowStateUpdate?: (updates: Partial<WindowState>) => void,
		manager?: WindowManager,
	): void {
		this.assertAlive();

		if (!win) {
			throw new Error(
				"WindowSync.start kräver win.",
			);
		}

		// Undvik dubbla sessioner.
		this.stop(win.winId);

		let stopped = false;

		let lastSnapshot: Record<string, unknown> | undefined;

		// ------------------------------------------
		// INCOMING MESSAGES
		// ------------------------------------------

		const unsubscribe = this.backend.onRawMessage(win.winId, (packet: WindowTransportPacket) => {
			// console.log(
			// 	"[SYNC RX]",
			// 	win.winId,
			// 	packet.from_WinId,
			// 	packet.message.type,
			// );

			// session is stopped
			if (stopped || this.destroyed) {
				return;
			}
			const message = packet.message;

			// För att förhindra att samma runime skall behandla sitt eget broadcst som inkommande meddelande
			if (
				packet.to_WinId !== win.winId ||
				message.winId !== win.winId
			) {
				return;
			}

			// if (message.wManagerId !== win.wManagerId) {
			//  	return;
			//  }

			// ----------------------------------
			// WINDOW STATE
			// ----------------------------------

			if (isWindowStateUpdateMessage(message, win.winId)) {
				try {
					applyWindowStateUpdate?.(
						message.updates,
					);
				} catch (error) {
					console.error(
						`[WindowSync] Kunde inte applicera fönstertillstånd för ${win.title}:`,
						error,
					);
				}

				return;
			}

			// ----------------------------------
			// PROPS
			// ----------------------------------

			if (
				message.type !== "sync:props" ||
				!message.props ||
				typeof message.props !== "object" ||
				Array.isArray(message.props)
			) {
				return;
			}

			const incoming = snapshot(message.props);

			// Identiska props behöver inte appliceras.
			if (lastSnapshot && deepEqual(lastSnapshot, incoming)) {
				return;
			}

			/**
			 * Uppdatera snapshot FÖRE mutation.
			 *
			 * När applyState ändrar Svelte-state
			 * körs effekten igen.
			 *
			 * Den kan då upptäcka att state redan
			 * finns lokalt och undvika en loop.
			 */
			lastSnapshot = snapshot(incoming);

			try {
				const rpc = this.getRpc(win.winId, () => win.wManagerId);
				const restoredProps = restoreRpcToCallbacks(
					incoming,
					rpc,
				);

				// console.log("[APPLY PROPS]", win.title, restoredProps);

				applyState(restoredProps);
			} catch (error) {
				console.error(
					`[WindowSync] Kunde inte applicera props för ${win.title}:`,
					error,
				);
			}
		});

		// ------------------------------------------
		// OUTGOING REACTIVE SYNCHRONIZATION
		// ------------------------------------------

		const stopEffect = $effect.root(() => {
			$effect(() => {
				if (stopped || this.destroyed) {
					return;
				}

				/**
				 * readProps måste läsa reaktiva värden
				 * så att Svelte kan spåra förändringar.
				 */
				const currentProps = readProps();
				// avgör om transport behövs
				if (manager) {
					// jag och min prent finns i samma runtime
					// const parent = manager.find(win.renderTargetWinId ?? ROOT_WIN_ID);
					// if (parent && parent.wManagerId === win.wManagerId) return;

					/**
					 * Hitta syskon med samma parent-grupp men i andra runtimes.
					 *
					 * Används för att avgöra om gruppen är spridd över
					 * flera WindowManagers (t.ex. detached fönster).
					 */
					const detachedSiblings = manager
						.windows
						.filter(
							(w) => w.parentId === win.parentId, //&&
							// w.wManagerId !== win.wManagerId,
						);

					// console.log("detachedsiblings ", detachedSiblings);
					if (detachedSiblings.length === 0) return;

					// if (win.renderTargetWinId && win.renderTargetWinId !== ROOT_WIN_ID) {
					// 	const parent = manager.find(win.renderTargetWinId);
					// 	if (parent && parent.wManagerId === win.wManagerId) {
					// 		return;
					// 	}
					// }
				}

				const transportProps = this.prepareForTransport(
					currentProps,
					win.winId,
					win.wManagerId,
				);

				const currentSnapshot = (transportProps as Record<string, unknown>) ?? {};

				// finns inget att uppdatera
				if (lastSnapshot && deepEqual(lastSnapshot, currentSnapshot)) {
					return;
				}

				lastSnapshot = currentSnapshot;

				const message: Extract<
					WindowMessage,
					{ type: "sync:props" }
				> = {
					type: "sync:props",
					winId: win.winId,
					wManagerId: win.wManagerId,
					parentId: win.parentId,
					renderTargetWinId: win.renderTargetWinId ?? ROOT_WIN_ID,
					props: currentSnapshot,
				};

				if (message.type === "sync:props" && message.renderTargetWinId !== (win.renderTargetWinId ?? ROOT_WIN_ID)) {
					console.log("felaktigt ..");
					return;
				}
				// Läge A : Jag är en parent vars Child har detachats
				// this.wMangerId === parent.wManagerId && ChildProcess.wManagerID !== this.wManagerId

				// Läge B : Jag är ett child som har flyttat till ny flik (wManager instans)
				// this.wManagerId === ChildProcess.wManagerId && ChildProcess.renderTargetWinId.wMangerId !== ChildProcess.wManagerId
				// Skicka till transporten.
				void this.backend
					.sendRaw(message)
					.catch((error) => {
						console.error(
							`[WindowSync] Transportfel för ${win.winId}:`,
							error,
						);
					});
			});
		});

		this.sessions.set(win.winId, {
			stopEffect,
			unsubscribe,
		});
	}

	startToMonitor(
		win: WindowInstance,
		wManager: WindowManager,
	): () => void {
		this.start(
			win,
			() => $state.snapshot(win.props),
			(incomingProps) => {
				// console.log("inkommande props");
				wManager.updateProps(
					incomingProps,
					win,
					{ publish: false, preserveReferences: true },
				);
			},
			(updates) => {
				wManager.updateState(
					win.winId,
					updates,
				);
			},
			wManager,
		);

		return () => {
			this.stop(win.winId);
		};
	}

	attachWindow(
		win: WindowInstance,
		manager: WindowManager,
	): () => void {
		this.startToMonitor(win, manager);
		return () => this.stop(win.winId);
	}

	// ----------------------------------------------
	// SEND STATE UPDATE
	// ----------------------------------------------

	async sendStateUpdate(
		winId: WindowId,
		updates: Partial<WindowState>,
		wManagerId: string,
	): Promise<void> {
		this.assertAlive();

		const message: Extract<
			WindowMessage,
			{ type: "sync:state-update" }
		> = {
			type: "sync:state-update",
			winId,
			wManagerId,
			updates: snapshot(updates),
		};

		await this.backend.sendRaw(message);
	}

	// ----------------------------------------------
	// SEND PROPS MANUALLY
	// ----------------------------------------------

	private readonly rpcHandlers = new Map<string, {
		callback: Function;
		unregister: () => void;
	}>();

	private prepareForTransport(
		value: unknown,
		winId: string,
		wManagerId: string,
		path = "props",
	): unknown {
		const rpc = this.getRpc(winId, wManagerId);

		if (typeof value === "function") {
			const method = `${winId}:${path}`;

			const existing = this.rpcHandlers.get(method);

			if (existing?.callback === value) {
				return `__RPC_CALLBACK__:${method}`;
			}

			existing?.unregister();

			const unregister = rpc.register(
				`callback:${method}`,
				async (...args: unknown[]) => value(...args),
			);

			this.rpcHandlers.set(method, {
				callback: value,
				unregister,
			});

			return `__RPC_CALLBACK__:${method}`;
		}

		if (Array.isArray(value)) {
			return value.map((item, index) =>
				this.prepareForTransport(
					item,
					winId,
					wManagerId,
					`${path}.${index}`,
				)
			);
		}

		if (value !== null && typeof value === "object") {
			const result: Record<string, unknown> = {};

			for (const [key, child] of Object.entries(value)) {
				result[key] = this.prepareForTransport(
					child,
					winId,
					wManagerId,
					`${path}.${key}`,
				);
			}

			return result;
		}

		return value;
	}
	/**
	 * Skickar props manuellt.
	 *
	 * Används exempelvis när manager.updateProps()
	 * anropas i ett detached fönster.
	 */

	async send(
		winId: string,
		props: Record<string, unknown>,
		wManagerId: string,
		parentId: WindowId | null,
		renderTargetWinId: WindowId,
	): Promise<void> {
		this.assertAlive();

		const rpc = this.getRpc(winId, wManagerId);

		const cleanProps = this.prepareForTransport(
			snapshot(props),
			winId,
			wManagerId,
		);

		const message: Extract<
			WindowMessage,
			{ type: "sync:props" }
		> = {
			type: "sync:props",
			winId,
			wManagerId,
			parentId,
			// renderTargetWinId = "root"
			renderTargetWinId,
			props: cleanProps as Record<string, unknown>,
		};

		await this.backend.sendRaw(message);
	}

	// ----------------------------------------------
	// CLOSE
	// ----------------------------------------------

	async close(winId: string, wManagerId: string): Promise<void> {
		this.stop(winId);

		await this.backend.close(winId, wManagerId);
	}

	/**
	 * Kompatibilitetsalias.
	 */
	async closeDetached(
		winId: string,
		wManagerId: string,
	): Promise<void> {
		await this.close(winId, wManagerId);
	}

	// ----------------------------------------------
	// STOP
	// ----------------------------------------------

	private cleanupRpc(winId: string): void {
		const prefix = `${winId}:`;

		for (const [method, handler] of this.rpcHandlers) {
			if (!method.startsWith(prefix)) continue;

			handler.unregister();
			this.rpcHandlers.delete(method);
		}

		const rpc = this.rpcInstances.get(winId);

		rpc?.destroy();
		this.rpcInstances.delete(winId);
		this.rpcManagerIds.delete(winId);
	}

	/**
	 * Stoppar en specifik synksession.
	 *
	 * Fönstret förblir öppet.
	 */
	stop(winId: string): void {
		const session = this.sessions.get(winId);

		if (!session) return;

		session.unsubscribe();

		session.stopEffect();

		this.sessions.delete(winId);
	}

	// ----------------------------------------------
	// DESTROY
	// ----------------------------------------------

	destroy(): void {
		if (this.destroyed) return;

		this.destroyed = true;

		for (const winId of [...this.sessions.keys()]) {
			this.stop(winId);
		}
	}

	// ----------------------------------------------
	// INTERNAL
	// ----------------------------------------------

	private assertAlive(): void {
		if (this.destroyed) {
			throw new Error(
				"WindowSync har förstörts.",
			);
		}
	}
}
