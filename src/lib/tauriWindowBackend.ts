import type {
  ExternalWindowDescriptor,
  WindowBackend,
} from "./windowBackend.ts";

export class TauriWindowBackend implements WindowBackend {
  private messageListeners = new Map<string, Set<(payload: any) => void>>();
  private unlistenFunctions = new Map<string, () => void>();

  constructor() {
    this.initGlobalTauriListener();
  }

  async open(windowDescriptor: ExternalWindowDescriptor): Promise<void> {
    const { winId, title, componentKey, payload } = windowDescriptor;

    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      console.error(
        "[TauriBackend] Kan inte öppna Tauri-fönster utanför en Tauri-miljö.",
      );
      return;
    }

    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const tauriLabel = `detached-${winId}`;

      const tauriWin = new WebviewWindow(tauriLabel, {
        url: `index.html?winId=${winId}&componentKey=${componentKey}&title=${
          encodeURIComponent(title)
        }`,
        title: title,
        width: 800,
        height: 600,
        decorations: true,
      });

      tauriWin.once("tauri://created", () => {
        setTimeout(async () => {
          const { emit } = await import("@tauri-apps/api/event");
          await emit(`init-payload-${winId}`, payload);
        }, 150);
      });
    } catch (error) {
      console.error(
        "[TauriBackend] Misslyckades att skapa nytt Tauri-fönster:",
        error,
      );
    }
  }

  async close(winId: string): Promise<void> {
    try {
      const { getAllWebviewWindows } = await import(
        "@tauri-apps/api/webviewWindow"
      );
      const targetLabel = `detached-${winId}`;
      const windows = await getAllWebviewWindows();

      const targetWin = windows.find((w) => w.label === targetLabel);
      if (targetWin) {
        await targetWin.close();
      }
    } catch (error) {
      console.error(
        `[TauriBackend] Kunde inte stänga fönster ${winId}:`,
        error,
      );
    }
  }

  async send(winId: string, payload: unknown): Promise<void> {
    try {
      const { emit } = await import("@tauri-apps/api/event");
      await emit(`sync-payload-${winId}`, payload);
    } catch (error) {
      console.error(
        `[TauriBackend] Misslyckades att skicka data till fönster ${winId}:`,
        error,
      );
    }
  }

  onMessage(winId: string, callback: (payload: unknown) => void): () => void {
    if (!this.messageListeners.has(winId)) {
      this.messageListeners.set(winId, new Set());
    }

    this.messageListeners.get(winId)!.add(callback);

    return () => {
      const listeners = this.messageListeners.get(winId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.messageListeners.delete(winId);
        }
      }
    };
  }

  private async initGlobalTauriListener(): Promise<void> {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    try {
      const { listen } = await import("@tauri-apps/api/event");
      const urlParams = new URLSearchParams(window.location.search);
      const currentWinId = urlParams.get("winId");

      if (!currentWinId) return;

      const unlistenInit = await listen<any>(
        `init-payload-${currentWinId}`,
        (event) => {
          const listeners = this.messageListeners.get(currentWinId);
          if (listeners) {
            listeners.forEach((callback) => callback(event.payload));
          }
          unlistenInit();
        },
      );

      const unlistenSync = await listen<any>(
        `sync-payload-${currentWinId}`,
        (event) => {
          const listeners = this.messageListeners.get(currentWinId);
          if (listeners) {
            listeners.forEach((callback) => callback(event.payload));
          }
        },
      );

      this.unlistenFunctions.set(currentWinId, () => {
        unlistenInit();
        unlistenSync();
      });
    } catch (error) {
      console.error(
        "[TauriBackend] Fel vid initiering av Tauri IPC-lyssnare:",
        error,
      );
    }
  }
}
