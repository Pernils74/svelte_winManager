import type {
  ExternalWindowDescriptor,
  WindowBackend,
} from "./windowBackend.ts";

export class BrowserTabBackend implements WindowBackend {
  private channel: BroadcastChannel;
  private messageListeners = new Map<string, Set<(payload: any) => void>>();
  private openedTabs = new Map<string, Window | null>();

  constructor() {
    // Skapa en delad kanal för hela applikationen (samma domän/origin)
    this.channel = new BroadcastChannel("svelte_winmanager_channel");
    this.initChannelListener();
  }

  /**
   * Öppnar en ny webbläsarflik med fönstret
   */
  async open(windowDescriptor: ExternalWindowDescriptor): Promise<void> {
    const { winId, title, componentKey, payload } = windowDescriptor;

    // Skapa en unik URL med query-parametrar så att den nya fliken vet vad den ska ladda
    const url = new URL(window.location.href);
    url.searchParams.set("winId", winId);
    url.searchParams.set("componentKey", componentKey);
    url.searchParams.set("title", title);

    // Spara initial payload i localStorage temporärt så att fliken kan läsa den vid boot
    localStorage.setItem(`win_payload_init_${winId}`, JSON.stringify(payload));

    // Öppna fliken
    const newTab = window.open(url.toString(), `_blank_${winId}`);

    // Spara en referens till fliken i huvudfönstret så vi kan stänga den via kod om det behövs
    this.openedTabs.set(winId, newTab);
  }

  /**
   * Stänger en extern flik (eller meddelar fliken att den ska stänga sig själv)
   */
  async close(winId: string): Promise<void> {
    // 1. Försök stänga direkt via fönsterreferensen om vi är i huvudfönstret
    const tab = this.openedTabs.get(winId);
    if (tab && !tab.closed) {
      tab.close();
      this.openedTabs.delete(winId);
      return;
    }

    // 2. Om referensen saknas (eller vi skickar signalen från en flik), skicka ett event över kanalen
    this.channel.postMessage({
      winId,
      type: "window:close",
    });
  }

  /**
   * Skickar uppdaterad payload till en specifik flik (eller tillbaka till huvudfönstret)
   */
  async send(winId: string, payload: unknown): Promise<void> {
    this.channel.postMessage({
      winId,
      type: "payload:update",
      payload,
    });
  }

  /**
   * Registrerar en lyssnare för inkommande meddelanden (t.ex. reaktiva payloads)
   * Returnerar en funktion för att avregistrera lyssnaren (cleanup)
   */
  onMessage(winId: string, callback: (payload: unknown) => void): () => void {
    if (!this.messageListeners.has(winId)) {
      this.messageListeners.set(winId, new Set());
    }

    this.messageListeners.get(winId)!.add(callback);

    // Returnera en rensningsfunktion (Unsubscribe) som passar Sveltes livscykel
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

  /**
   * Intern lyssnare som tar emot alla meddelanden från BroadcastChannel
   */
  private initChannelListener(): void {
    this.channel.onmessage = (event) => {
      const { winId, type, payload } = event.data || {};
      if (!winId || !type) return;

      // Hantera stängningssignal
      if (type === "window:close") {
        // Kontrollera om denna flik är den som ska stängas
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get("winId") === winId) {
          window.close();
        }
        return;
      }

      // Hantera payload-uppdateringar
      if (type === "payload:update") {
        const listeners = this.messageListeners.get(winId);
        if (listeners) {
          listeners.forEach((callback) => callback(payload));
        }
      }
    };
  }
}
