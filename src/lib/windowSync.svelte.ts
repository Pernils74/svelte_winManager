// src/lib/windowSync.svelte.ts

import type {
	DetachedWindowState,
	ExternalWindowDescriptor,
	WindowBackend,
	// WindowTarget,
	WindowTransportPacket,
	WindowViewPortType,
} from "./windowBackend";

type ReadState = () => DetachedWindowState;

type ApplyState = (
	state: DetachedWindowState,
) => void;

interface SyncMessage {
	kind: "sync";
	state: DetachedWindowState;
}

interface SyncSession {
	stopEffect: () => void;
	unsubscribe: () => void;
}

function snapshot<T>(value: T): T {
	return $state.snapshot(value);
}

/**
 * Jämför strukturerade värden utan JSON.stringify.
 *
 * Optimerad för JSON-kompatibla payloads och props.
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

	if (a instanceof Date && b instanceof Date) {
		return a.getTime() === b.getTime();
	}

	if (a instanceof RegExp && b instanceof RegExp) {
		return (
			a.source === b.source &&
			a.flags === b.flags
		);
	}

	if (
		a instanceof ArrayBuffer &&
		b instanceof ArrayBuffer
	) {
		if (a.byteLength !== b.byteLength) return false;

		const bytesA = new Uint8Array(a);
		const bytesB = new Uint8Array(b);

		for (let i = 0; i < bytesA.length; i++) {
			if (bytesA[i] !== bytesB[i]) return false;
		}

		return true;
	}

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
		};

		const viewB = b as unknown as {
			length?: number;
			[index: number]: number;
			byteLength: number;
		};

		if (
			viewA.byteLength !== viewB.byteLength
		) {
			return false;
		}

		if (
			viewA.length !== undefined &&
			viewB.length !== undefined
		) {
			for (
				let i = 0;
				i < viewA.length;
				i++
			) {
				if (viewA[i] !== viewB[i]) {
					return false;
				}
			}
		}

		return true;
	}

	if (a instanceof Map && b instanceof Map) {
		if (a.size !== b.size) return false;

		for (const [key, value] of a) {
			if (!b.has(key)) return false;

			if (
				!deepEqual(
					value,
					b.get(key),
					seen,
				)
			) {
				return false;
			}
		}

		return true;
	}

	if (a instanceof Set && b instanceof Set) {
		if (a.size !== b.size) return false;

		for (const value of a) {
			if (!b.has(value)) return false;
		}

		return true;
	}

	const keysA = Reflect.ownKeys(objectA);
	const keysB = Reflect.ownKeys(objectB);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (const key of keysA) {
		if (
			!Object.prototype.hasOwnProperty.call(
				objectB,
				key,
			)
		) {
			return false;
		}

		if (
			!deepEqual(
				(objectA as Record<PropertyKey, unknown>)[key],
				(objectB as Record<PropertyKey, unknown>)[key],
				seen,
			)
		) {
			return false;
		}
	}

	return true;
}

function isSyncMessage(
	value: unknown,
): value is SyncMessage {
	if (!value || typeof value !== "object") {
		return false;
	}

	const message = value as Record<string, unknown>;

	if (message.kind !== "sync") return false;

	const state = message.state;

	if (!state || typeof state !== "object") {
		return false;
	}

	const candidate = state as Record<string, unknown>;

	return (
		"payload" in candidate &&
		"props" in candidate &&
		typeof candidate.props === "object" &&
		candidate.props !== null &&
		!Array.isArray(candidate.props)
	);
}

// function targetToViewport(
// 	target: WindowTarget,
// ): WindowViewPortType {
// 	switch (target) {
// 		case "tab":
// 			return "browser-tab";

// 		case "window":
// 			return "browser-window";

// 		case "tauri":
// 			return "tauri-window";

// 		default: {
// 			const exhaustiveCheck: never = target;

// 			throw new Error(
// 				`Okänd window target: ${exhaustiveCheck}`,
// 			);
// 		}
// 	}
// }

export class WindowSync {
	private readonly sessions = new Map<
		string,
		SyncSession
	>();

	private destroyed = false;

	constructor(
		private readonly backend: WindowBackend,
	) {}

	/**
	 * Öppnar ett externt fönster.
	 *
	 * Snapshot säkerställer att reaktiva proxies
	 * inte lämnar den aktuella runtime-instansen.
	 */
	async open(
		descriptor: ExternalWindowDescriptor,
		target: WindowViewPortType,
	): Promise<void> {
		this.assertAlive();

		const cleanDescriptor = snapshot({
			...descriptor,
			payload: descriptor.payload,
			props: descriptor.props ?? {},
		});

		await this.backend.open(
			cleanDescriptor,
			target,
		);
	}

	/**
	 * Startar dubbelriktad state-synkronisering.
	 *
	 * readState:
	 * Läser aktuell payload och props.
	 *
	 * applyState:
	 * Applicerar inkommande state.
	 */
	start(
		winId: string,
		readState: ReadState,
		applyState: ApplyState,
	): void {
		this.assertAlive();

		if (!winId) {
			throw new Error(
				"WindowSync.start kräver winId.",
			);
		}

		this.stop(winId);

		let stopped = false;

		let lastSnapshot:
			| DetachedWindowState
			| undefined;

		// --------------------------------------------
		// Incoming messages
		// --------------------------------------------

		const unsubscribe = this.backend.onRawMessage(
			winId,
			(packet: WindowTransportPacket) => {
				if (stopped || this.destroyed) {
					return;
				}

				// Ignorera egna utskick.
				if (
					packet.sourceId ===
						this.backend.endpointId
				) {
					return;
				}

				if (!isSyncMessage(packet.data)) {
					return;
				}

				const incoming = snapshot({
					payload: packet.data.state.payload,
					props: packet.data.state.props,
				});

				// Identiskt state behöver inte appliceras.
				if (
					lastSnapshot &&
					deepEqual(
						lastSnapshot,
						incoming,
					)
				) {
					return;
				}

				// Uppdatera referensen FÖRE state-mutation.
				//
				// När applyState ändrar Svelte-state
				// kommer effekten att köras igen.
				// Då kan den upptäcka att state redan
				// har skickats och undvika en loop.
				lastSnapshot = incoming;

				try {
					applyState(incoming);
				} catch (error) {
					console.error(
						`[WindowSync] Kunde inte applicera state för ${winId}:`,
						error,
					);
				}
			},
		);

		// --------------------------------------------
		// Outgoing reactive synchronization
		// --------------------------------------------

		const stopEffect = $effect.root(() => {
			$effect(() => {
				if (stopped || this.destroyed) {
					return;
				}

				// readState måste läsa reaktiva värden.
				const current = readState();

				// Skapa en clone-safe snapshot.
				const currentSnapshot = snapshot({
					payload: current.payload,
					props: current.props ?? {},
				});

				// Ingen förändring: inget nätverksmeddelande.
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

				const message: SyncMessage = {
					kind: "sync",
					state: currentSnapshot,
				};

				// Transportfel hanteras utan att förstöra
				// den reaktiva effekten.
				void this.backend
					.sendRaw(winId, message)
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

	/**
	 * Skickar state manuellt.
	 */
	async send(
		winId: string,
		state: DetachedWindowState,
	): Promise<void> {
		this.assertAlive();

		const cleanState = snapshot({
			payload: state.payload,
			props: state.props ?? {},
		});

		await this.backend.sendRaw(winId, {
			kind: "sync",
			state: cleanState,
		});
	}

	/**
	 * Stoppar synkronisering och stänger
	 * det externa fönstret.
	 */
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

	/**
	 * Stoppar samtliga sessioner.
	 */
	destroy(): void {
		if (this.destroyed) return;

		this.destroyed = true;

		for (
			const winId of [
				...this.sessions.keys(),
			]
		) {
			this.stop(winId);
		}
	}

	private assertAlive(): void {
		if (this.destroyed) {
			throw new Error(
				"WindowSync har förstörts.",
			);
		}
	}
}
