export type WindowTarget = "internal" | "tab" | "tauri";

export interface ExternalWindowDescriptor {
  winId: string;
  title: string;
  componentKey: string;
  payload: unknown;
}

export interface WindowBackend {
  open(window: ExternalWindowDescriptor): Promise<void>;

  close(winId: string): Promise<void>;

  send(
    winId: string,
    payload: unknown,
  ): Promise<void>;

  onMessage(
    winId: string,
    callback: (payload: unknown) => void,
  ): () => void;
}
