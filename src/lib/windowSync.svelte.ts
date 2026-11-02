// src/lib/windowSync.svelte.ts

import type {
	DetachedWindowState,
	ExternalWindowDescriptor,
	WindowBackend,
	WindowTarget,
	WindowViewPortType,
} from "./windowBackend";

type ApplyState = (state: DetachedWindowState) => void;
type ReadState = () => DetachedWindowState;

interface SyncSession {
	stopEffect: () => void;
	unsubscribe: () => void;
}

const targetToViewport = (target: WindowTarget): WindowViewPortType => {
	switch (target) {
		case "tab":
			return "browser-tab";

		case "window":
			return "browser-window";

		case "tauri":
			return "tauri-window";

		default: {
			const exhaustiveCheck: never = target;
			throw new Error(`Okänd fönstertyp: ${exhaustiveCheck}`);
		}
	}
};

/**
 * Hanterar all state-synkronisering mellan workspace och frikopplade fönster.
 *
 * WindowBackend ansvarar för den faktiska transporten:
 * - BroadcastChannel och localStorage i webbläsaren
 * - Tauri events i Tauri
 *
 * WindowSync ansvarar för:
 * - öppna och stänga externa fönster
 * - prenumerera på inkommande state
 * - skicka ändringar från workspace
 * - städa upp prenumerationer och Svelte-effekter
 */
export class WindowSync {
	private sessions = new Map<string, SyncSession>();

	constructor(private readonly backend: WindowBackend) {}

	/**
	 * Öppnar ett frikopplat fönster.
	 */
	async open(
		descriptor: ExternalWindowDescriptor,
		target: WindowTarget,
	): Promise<void> {
		// await this.backend.open(descriptor, targetToViewport(target));
		await this.backend.open(descriptor, target);
	}

	/**
	 * Startar synkronisering för ett fönster.
	 *
	 * readState läser aktuell payload och props från WindowManager.
	 * applyState applicerar inkommande payload och props på WindowManager.
	 */
	start(
		winId: string,
		readState: ReadState,
		applyState: ApplyState,
	): void {
		// Undvik dubbla prenumerationer för samma fönster.
		this.stop(winId);

		const unsubscribe = this.backend.onMessage(winId, (state) => {
			applyState(state);
		});

		const stopEffect = $effect.root(() => {
			$effect(() => {
				const state = readState();

				const cleanState = ""; //snapshot(state);

				void this.backend.send(winId, {
					payload: state.payload,
					props: state.props,
				});

				// void this.backend.send(winId, {
				// 	payload: cleanState.payload,
				// 	props: cleanState.props,
				// });
			});

			return () => {
				// Svelte kör cleanup när effektroten förstörs.
			};
		});

		this.sessions.set(winId, {
			stopEffect,
			unsubscribe,
		});
	}

	/**
	 * Skickar ett state manuellt.
	 */
	async send(
		winId: string,
		state: DetachedWindowState,
	): Promise<void> {
		await this.backend.send(winId, state);
	}

	/**
	 * Stänger ett frikopplat fönster.
	 */
	async close(winId: string): Promise<void> {
		this.stop(winId);
		await this.backend.close(winId);
	}

	/**
	 * Stoppar synkronisering utan att stänga själva fönstret.
	 */
	stop(winId: string): void {
		const session = this.sessions.get(winId);

		if (!session) return;

		session.unsubscribe();
		session.stopEffect();

		this.sessions.delete(winId);
	}

	/**
	 * Stoppar all synkronisering.
	 */
	destroy(): void {
		for (const winId of this.sessions.keys()) {
			this.stop(winId);
		}
	}
}
