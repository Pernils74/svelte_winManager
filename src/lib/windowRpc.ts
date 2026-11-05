// src/lib/windowRpc.ts

import type { WindowBackend, WindowMessage } from "./windowBackend";

export interface RpcTransport {
	readonly endpointId: string;

	send(message: WindowMessage): Promise<void>;

	onMessage(
		winId: string,
		callback: (message: WindowMessage) => void,
	): () => void;
}

export type RpcHandler = (
	...args: unknown[]
) => unknown | Promise<unknown>;

export interface WindowRpcOptions {
	timeoutMs?: number;
	sourceId?: string;
	targetEndpointId?: string;
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

	private readonly unsubscribe: () => void;

	private destroyed = false;

	constructor(
		private readonly transport: RpcTransport,
		private readonly winId: string,
		options: WindowRpcOptions = {},
	) {
		if (!winId) {
			throw new Error("WindowRpc kräver ett winId.");
		}

		this.sourceId = options.sourceId ??
			transport.endpointId;

		this.targetEndpointId = options.targetEndpointId;

		this.timeoutMs = options.timeoutMs ?? 10_000;

		this.unsubscribe = transport.onMessage(
			winId,
			(message) => {
				void this.handleMessage(message);
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
			winId: this.winId,
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

			void this.transport.send(request).catch((error) => {
				const pending = this.pending.get(requestId);

				if (!pending) return;

				clearTimeout(pending.timeout);
				this.pending.delete(requestId);

				pending.reject(toError(error));
			});
		});
	}

	private async handleMessage(
		message: WindowMessage,
	): Promise<void> {
		if (
			this.destroyed ||
			(message.type !== "rpc:request" &&
				message.type !== "rpc:response")
		) {
			return;
		}

		if (message.winId !== this.winId) return;
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
					winId: this.winId,
					requestId: message.requestId,
					sourceId: this.sourceId,
					targetEndpointId: message.sourceId,
					result,
				};
			} catch (error) {
				response = {
					type: "rpc:response",
					winId: this.winId,
					requestId: message.requestId,
					sourceId: this.sourceId,
					targetEndpointId: message.sourceId,
					error: toError(error).message,
				};
			}

			if (this.destroyed) return;

			await this.transport.send(response);
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

		async send(message: WindowMessage): Promise<void> {
			if (
				message.type !== "rpc:request" &&
				message.type !== "rpc:response"
			) {
				throw new Error(
					"RPC-transporten kan endast skicka RPC-meddelanden.",
				);
			}

			await broker.sendRaw(message);
		},

		onMessage(winId, callback) {
			return broker.onRawMessage(
				winId,
				(packet) => {
					if (packet.winId !== winId) return;

					if (
						packet.message.type !== "rpc:request" &&
						packet.message.type !== "rpc:response"
					) {
						return;
					}

					callback(packet.message);
				},
			);
		},
	};
}
