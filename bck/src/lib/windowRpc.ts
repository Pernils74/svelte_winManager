// src/lib/windowRpc.ts

import type {
	WindowBackend,
	WindowEndpoint,
	WindowMessage,
	WindowTransportOptions,
	WindowTransportPacket,
} from "./windowBackend";

export interface RpcTransport {
	readonly endpointId: string;

	send(message: WindowMessage, options: WindowTransportOptions): Promise<void>;

	onMessage(
		winId: string,
		callback: (packet: WindowTransportPacket) => void,
	): () => void;
}

export type RpcHandler = (
	...args: unknown[]
) => unknown | Promise<unknown>;

export interface WindowRpcOptions {
	timeoutMs?: number;
	sourceId?: string;
	targetEndpointId?: string;
	wManagerId: string | (() => string);
	localRuntimeId: string;
	parentId: string | null;
}

interface PendingRequest {
	method: string;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

function createId(): string {
	return crypto.randomUUID();
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export class WindowRpc {
	private readonly handlers = new Map<string, RpcHandler>();

	private readonly pending = new Map<string, PendingRequest>();

	private readonly sourceId: string;
	private readonly targetEndpointId?: string;
	private readonly timeoutMs: number;
	private readonly getWManagerId: () => string;
	private readonly localRuntimeId: string;
	private readonly parentId: string | null;

	private readonly unsubscribe: () => void;

	private destroyed = false;

	constructor(
		private readonly transport: RpcTransport,
		private readonly winId: string,
		options: WindowRpcOptions,
	) {
		if (!winId) {
			throw new Error("WindowRpc kräver ett winId.");
		}

		this.sourceId = options.sourceId ??
			transport.endpointId;

		this.targetEndpointId = options.targetEndpointId;
		this.localRuntimeId = options.localRuntimeId;
		this.parentId = options.parentId;

		this.timeoutMs = options.timeoutMs ?? 10_000;
		const managerId = options.wManagerId;
		this.getWManagerId = typeof managerId === "function"
			? managerId
			: () => managerId;

		this.unsubscribe = transport.onMessage(
			winId,
			(packet) => {
				void this.handleMessage(packet);
			},
		);
	}

	get endpointId(): string {
		return this.sourceId;
	}

	/**
	 * Registrerar en RPC-metod.
	 */
	register(
		method: string,
		handler: RpcHandler,
	): () => void {
		this.assertAlive();

		if (!method.trim()) {
			throw new Error(
				"RPC-metoden måste ha ett namn.",
			);
		}

		if (this.handlers.has(method)) {
			throw new Error(
				`RPC-metoden "${method}" är redan registrerad.`,
			);
		}

		this.handlers.set(method, handler);

		return () => {
			if (this.handlers.get(method) === handler) {
				this.handlers.delete(method);
			}
		};
	}

	/**
	 * Anropar en RPC-metod.
	 *
	 * Om targetEndpointId är angivet adresseras
	 * endast den specifika runtime-instansen.
	 *
	 * Utan targetEndpointId skickas requesten
	 * till samtliga andra instanser med samma winId.
	 */
	call<T = unknown>(
		method: string,
		...args: unknown[]
	): Promise<T> {
		this.assertAlive();

		if (!method.trim()) {
			return Promise.reject(
				new Error("RPC-metoden saknar namn."),
			);
		}

		const requestId = createId();

		const request: Extract<
			WindowMessage,
			{ type: "rpc:request" }
		> = {
			type: "rpc:request" as const,
			requestId,
			sourceId: this.sourceId,
			targetEndpointId: this.targetEndpointId,
			method,
			args,
		};

		return new Promise<T>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(requestId);

				reject(
					new Error(
						`RPC timeout efter ${this.timeoutMs}ms: ${method}`,
					),
				);
			}, this.timeoutMs);

			this.pending.set(requestId, {
				method,
				resolve: resolve as (value: unknown) => void,
				reject,
				timeout,
			});

			const from: WindowEndpoint = {
				wManagerId: this.localRuntimeId,
				winId: this.winId,
				parentId: this.parentId,
			};
			void this.transport.send(request, {
				from,
				to: {
					type: "window",
					endpoint: {
						wManagerId: this.getWManagerId(),
						winId: this.winId,
						parentId: this.parentId,
					},
				},
			}).catch((error) => {
				const pending = this.pending.get(requestId);

				if (!pending) return;

				clearTimeout(pending.timeout);
				this.pending.delete(requestId);

				pending.reject(toError(error));
			});
		});
	}

	private async handleMessage(packet: WindowTransportPacket): Promise<void> {
		const message = packet.message;
		if (
			this.destroyed ||
			(message.type !== "rpc:request" &&
				message.type !== "rpc:response")
		) {
			return;
		}

		if (
			packet.to.type !== "window" ||
			packet.to.endpoint.winId !== this.winId ||
			packet.to.endpoint.wManagerId !== this.localRuntimeId
		) {
			return;
		}
		// Ignorera alltid egna utskick.
		if (message.sourceId === this.sourceId) return;
		if (message.type === "rpc:response") {
			// Responsen måste vara avsedd för oss.
			if (message.targetEndpointId !== this.sourceId) {
				return;
			}

			const pending = this.pending.get(
				message.requestId,
			);

			if (!pending) return;
			clearTimeout(pending.timeout);
			this.pending.delete(message.requestId);
			if (message.error !== undefined) {
				pending.reject(
					new Error(message.error),
				);
			} else {
				pending.resolve(message.result);
			}
			return;
		}

		if (message.type === "rpc:request") {
			// Om requesten har en uttrycklig mottagare
			// ska endast den instansen exekvera den.
			if (
				message.targetEndpointId !== undefined &&
				message.targetEndpointId !== this.sourceId
			) {
				return;
			}
			const handler = this.handlers.get(message.method);

			let response: Extract<
				WindowMessage,
				{ type: "rpc:response" }
			>;

			try {
				if (!handler) {
					throw new Error(
						`RPC-metoden "${message.method}" är inte registrerad.`,
					);
				}

				const result = await handler(...message.args);

				response = {
					type: "rpc:response",
					requestId: message.requestId,
					sourceId: this.sourceId,
					targetEndpointId: message.sourceId,
					result,
				};
			} catch (error) {
				response = {
					type: "rpc:response",
					requestId: message.requestId,
					sourceId: this.sourceId,
					targetEndpointId: message.sourceId,
					error: toError(error).message,
				};
			}

			if (this.destroyed) return;

			await this.transport.send(response, {
				from: {
					wManagerId: this.localRuntimeId,
					winId: this.winId,
					parentId: this.parentId,
				},
				to: {
					type: "window",
					endpoint: packet.from,
				},
			});
		}
	}

	private assertAlive(): void {
		if (this.destroyed) {
			throw new Error(
				"WindowRpc har förstörts.",
			);
		}
	}

	/**
	 * Avregistrerar alla handlers och avslutar
	 * samtliga väntande requests.
	 */
	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.unsubscribe();

		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);

			pending.reject(
				new Error("WindowRpc har stängts."),
			);
		}

		this.pending.clear();
		this.handlers.clear();
	}
}

/**
 * Interface mot den gemensamma WindowBackend-kanalen.
 *
 * RPC känner inte till BroadcastChannel,
 * LocalStorage eller Tauri.
 */
export type RawRpcBroker = Pick<
	WindowBackend,
	"endpointId" | "sendRaw" | "onRawMessage"
>;

export function createRpcTransport(
	broker: RawRpcBroker,
): RpcTransport {
	return {
		endpointId: broker.endpointId,

		async send(
			message: WindowMessage,
			options: WindowTransportOptions,
		): Promise<void> {
			if (
				message.type !== "rpc:request" &&
				message.type !== "rpc:response"
			) {
				throw new Error(
					"RPC-transporten kan endast skicka RPC-meddelanden.",
				);
			}

			await broker.sendRaw(message, options);
		},

		onMessage(winId, callback) {
			return broker.onRawMessage(
				winId,
				(packet) => {
					if (
						packet.to.type !== "window" ||
						packet.to.endpoint.winId !== winId
					) {
						return;
					}

					if (
						packet.message.type !== "rpc:request" &&
						packet.message.type !== "rpc:response"
					) {
						return;
					}

					callback(packet);
				},
			);
		},
	};
}
