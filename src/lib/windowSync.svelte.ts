import type {
	DetachedWindowState,
	ExternalWindowDescriptor,
	WindowBackend,
	WindowMessage,
	WindowTransportPacket,
	WindowViewPortType,
} from "./windowBackend";

import type { WindowId, WindowState } from "./windowManager.svelte";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type ReadState = () => DetachedWindowState;

type ApplyState = (state: DetachedWindowState) => void;

interface SyncSession {
	stopEffect: () => void;
	unsubscribe: () => void;
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function snapshot<T>(value: T): T {
	return $state.snapshot(value);
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
): value is Extract<
	WindowMessage,
	{ type: "sync:state-update" }
> {
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

// windowSync.svelte.ts (Rad ~315)
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
		target: WindowViewPortType,
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

	// ----------------------------------------------
	// START
	// ----------------------------------------------

	/**
	 * Startar dubbelriktad props-synkronisering.
	 *
	 * readState:
	 * Läser aktuella reaktiva props.
	 *
	 * applyState:
	 * Applicerar inkommande props.
	 *
	 * applyWindowStateUpdate:
	 * Applicerar inkommande fönstergeometri/state.
	 */
	start(
		winId: string,
		readState: ReadState,
		applyState: ApplyState,
		applyWindowStateUpdate?: (updates: Partial<WindowState>) => void,
		rpc?: any, // 🌟 Lägg till rpc här!
	): void {
		this.assertAlive();

		if (!winId) {
			throw new Error(
				"WindowSync.start kräver winId.",
			);
		}

		// Undvik dubbla sessioner.
		this.stop(winId);

		let stopped = false;

		let lastSnapshot:
			| DetachedWindowState
			| undefined;

		// ------------------------------------------
		// INCOMING MESSAGES
		// ------------------------------------------

		const unsubscribe = this.backend.onRawMessage(
			winId,
			(packet: WindowTransportPacket) => {
				if (stopped || this.destroyed) {
					return;
				}

				// Ignorera egna utskick.
				if (packet.sourceId === this.backend.endpointId) {
					return;
				}

				const message = packet.message;

				if (message.winId !== winId) {
					return;
				}

				// ----------------------------------
				// WINDOW STATE
				// ----------------------------------

				if (isWindowStateUpdateMessage(message, winId)) {
					try {
						applyWindowStateUpdate?.(
							message.updates,
						);
					} catch (error) {
						console.error(
							`[WindowSync] Kunde inte applicera fönstertillstånd för ${winId}:`,
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
					!message.state ||
					typeof message.state.props !== "object" ||
					message.state.props === null ||
					Array.isArray(message.state.props)
				) {
					return;
				}

				const incoming = snapshot({
					props: message.state.props,
				});

				// Identiskt state behöver inte appliceras.
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
				lastSnapshot = incoming;

				try {
					const restoredProps = restoreRpcToCallbacks(incoming.props);
					applyState(incoming);
				} catch (error) {
					console.error(
						`[WindowSync] Kunde inte applicera props för ${winId}:`,
						error,
					);
				}
			},
		);

		// ------------------------------------------
		// OUTGOING REACTIVE SYNCHRONIZATION
		// ------------------------------------------

		const stopEffect = $effect.root(() => {
			$effect(() => {
				if (stopped || this.destroyed) {
					return;
				}

				/**
				 * readState måste läsa reaktiva värden
				 * så att Svelte kan spåra förändringar.
				 */
				const current = readState();

				// Skapa clone-safe snapshot.
				const currentSnapshot = snapshot({
					props: current.props ?? {},
				});

				// Ingen förändring.
				if (
					lastSnapshot &&
					deepEqual(
						lastSnapshot,
						currentSnapshot,
					)
				) {
					return;
				}

				lastSnapshot = currentSnapshot;

				const message: Extract<
					WindowMessage,
					{ type: "sync:props" }
				> = {
					type: "sync:props",
					winId,
					state: currentSnapshot,
				};

				// Skicka till transporten.
				void this.backend
					.sendRaw(message)
					.catch((error) => {
						console.error(
							`[WindowSync] Transportfel för ${winId}:`,
							error,
						);
					});
			});
		});

		this.sessions.set(winId, {
			stopEffect,
			unsubscribe,
		});
	}

	// ----------------------------------------------
	// SEND STATE UPDATE
	// ----------------------------------------------

	async sendStateUpdate(
		winId: WindowId,
		updates: Partial<WindowState>,
	): Promise<void> {
		this.assertAlive();

		const message: Extract<
			WindowMessage,
			{ type: "sync:state-update" }
		> = {
			type: "sync:state-update",
			winId,
			updates: snapshot(updates),
		};

		await this.backend.sendRaw(message);
	}

	// ----------------------------------------------
	// SEND PROPS MANUALLY
	// ----------------------------------------------

	/**
	 * Skickar props manuellt.
	 *
	 * Används exempelvis när manager.updateProps()
	 * anropas i ett detached fönster.
	 */
	async send(
		winId: string,
		state: DetachedWindowState,
	): Promise<void> {
		this.assertAlive();

		const cleanState = snapshot({
			props: state.props ?? {},
		});

		const message: Extract<
			WindowMessage,
			{ type: "sync:props" }
		> = {
			type: "sync:props",
			winId,
			state: cleanState,
		};

		await this.backend.sendRaw(message);
	}

	// ----------------------------------------------
	// CLOSE
	// ----------------------------------------------

	async close(winId: string): Promise<void> {
		this.stop(winId);

		await this.backend.close(winId);
	}

	/**
	 * Kompatibilitetsalias.
	 */
	async closeDetached(
		winId: string,
	): Promise<void> {
		await this.close(winId);
	}

	// ----------------------------------------------
	// STOP
	// ----------------------------------------------

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
