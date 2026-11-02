// src/lib/windowRpc.ts

export interface RpcRequest {
	type: "rpc:request";
	requestId: string;
	winId: string;
	method: string;
	args: unknown[];
}

export interface RpcResponse {
	type: "rpc:response";
	requestId: string;
	winId: string;
	result?: unknown;
	error?: string;
}

export type RpcMessage = RpcRequest | RpcResponse;

export interface RpcTransport {
	send(message: RpcMessage): Promise<void>;

	onMessage(
		callback: (message: RpcMessage) => void,
	): () => void;
}

type RpcHandler = (...args: any[]) => unknown | Promise<unknown>;

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

export class WindowRpc {
	private handlers = new Map<string, RpcHandler>();
	private pending = new Map<string, PendingRequest>();
	private unsubscribe: () => void;

	constructor(
		private readonly transport: RpcTransport,
		private readonly winId: string,
		private readonly timeoutMs = 10000,
	) {
		this.unsubscribe = transport.onMessage((message) => {
			void this.handleMessage(message);
		});
	}

	/**
	 * Registrera en metod som kan anropas via RPC.
	 */
	register(method: string, handler: RpcHandler): () => void {
		this.handlers.set(method, handler);

		return () => {
			this.handlers.delete(method);
		};
	}

	/**
	 * Anropa en metod på andra sidan.
	 */
	call<T = unknown>(
		method: string,
		...args: unknown[]
	): Promise<T> {
		const requestId = crypto.randomUUID();

		return new Promise<T>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(requestId);

				reject(
					new Error(`RPC timeout: ${method}`),
				);
			}, this.timeoutMs);

			this.pending.set(requestId, {
				resolve: resolve as (value: unknown) => void,
				reject,
				timeout,
			});

			const request: RpcRequest = {
				type: "rpc:request",
				requestId,
				winId: this.winId,
				method,
				args,
			};

			void this.transport.send(request).catch((error) => {
				const pending = this.pending.get(requestId);

				if (!pending) return;

				clearTimeout(pending.timeout);
				this.pending.delete(requestId);
				pending.reject(
					error instanceof Error ? error : new Error(String(error)),
				);
			});
		});
	}

	private async handleMessage(message: RpcMessage): Promise<void> {
		if (message.winId !== this.winId) return;

		if (message.type === "rpc:response") {
			const pending = this.pending.get(message.requestId);

			if (!pending) return;

			clearTimeout(pending.timeout);
			this.pending.delete(message.requestId);

			if (message.error) {
				pending.reject(new Error(message.error));
			} else {
				pending.resolve(message.result);
			}

			return;
		}

		if (message.type === "rpc:request") {
			const handler = this.handlers.get(message.method);

			let response: RpcResponse;

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
					winId: this.winId,
					result,
				};
			} catch (error) {
				response = {
					type: "rpc:response",
					requestId: message.requestId,
					winId: this.winId,
					error: error instanceof Error ? error.message : String(error),
				};
			}

			await this.transport.send(response);
		}
	}

	destroy(): void {
		this.unsubscribe();

		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("RPC har stängts."));
		}

		this.pending.clear();
		this.handlers.clear();
	}
}
