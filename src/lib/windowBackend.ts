// src/lib/windowBackend.ts

// Längst upp i din fil (eller i funktionen) kan du importera SvelteKits base path:
//  import { base } from "$app/paths";

export type WindowTarget = "internal" | "tab" | "tauri";

export interface ExternalWindowDescriptor {
  winId: string;
  title: string;
  componentKey: string;
  payload: unknown;
  props: Record<string, unknown>;
}

export interface DetachedWindowState {
  payload: unknown;
  props: Record<string, unknown>;
}

export interface WindowBackend {
  readonly target: Exclude<WindowTarget, "internal">;

  open(window: ExternalWindowDescriptor): Promise<void>;
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

type BrowserMessage =
  | {
    winId: string;
    // type: "payload:update" | "payload:init";
    type: "state:update";
    state: DetachedWindowState;
  }
  | {
    winId: string;
    type: "window:close";
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
  private openedTabs = new Map<string, Window | null>();

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

  /**
   * Öppnar ett externt fönster.
   */
  async open(descriptor: ExternalWindowDescriptor): Promise<void> {
    if (this.destroyed) {
      throw new Error("WindowBackendManager har redan förstörts.");
    }

    if (!descriptor.winId || !descriptor.componentKey) {
      throw new Error("winId och componentKey krävs.");
    }

    if (this.target === "tauri") {
      await this.openTauri(descriptor);
    } else {
      await this.openBrowserTab(descriptor);
    }
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
          (item: { label: string; close: () => Promise<void> }) =>
            item.label === label,
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

    const tab = this.openedTabs.get(winId);

    if (tab && !tab.closed) {
      tab.close();
      this.openedTabs.delete(winId);
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

    for (const unlisten of this.unlistenFunctions.values()) {
      unlisten();
    }

    this.unlistenFunctions.clear();
    this.listeners.clear();
    this.openedTabs.clear();
  }

  // --------------------------------------------------
  // Browser-tab backend
  // --------------------------------------------------

  private openBrowserTab(
    descriptor: ExternalWindowDescriptor,
  ): void { // <-- Ändrat från Promise<void> till void
    const { winId, title, componentKey, payload, props } = descriptor;

    const url = new URL(globalThis.location.href);

    // 2. Extrahera appens bas-sökväg dynamiskt (t.ex. '/svelte_winManager/' eller '/')
    // Detta fungerar oavsett om du kör lokalt på localhost:5173 eller live på GitHub Pages!
    const currentPath = globalThis.location.pathname;
    const projectBase = currentPath.substring(
      0,
      currentPath.indexOf("/", 1) + 1,
    );

    // Om vi kör live på GitHub Pages sätter vi pathname till undermappens bas, annars behåller vi roten
    url.pathname = globalThis.location.hostname.includes("github.io")
      ? projectBase
      : "/";

    url.searchParams.set("winId", winId);
    url.searchParams.set("componentKey", componentKey);
    url.searchParams.set("title", title);

    try {
      localStorage.setItem(
        initStorageKey(winId),
        JSON.stringify({ payload, props }),
      );
    } catch (error) {
      console.error(
        `[WindowBackend] Kunde inte spara initial payload för ${winId}:`,
        error,
      );
      throw error;
    }
    const tab = globalThis.open(url.toString(), `_blank_${winId}`);
    if (!tab) {
      localStorage.removeItem(initStorageKey(winId));

      throw new Error(
        "Webbläsaren blockerade den nya fliken. Tillåt popup-fönster för sidan.",
      );
    }

    this.openedTabs.set(winId, tab);
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
      this.notifyListeners(
        message.winId,
        message.state,
      );
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
    const { WebviewWindow } = await import(webviewWindowPath);

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
