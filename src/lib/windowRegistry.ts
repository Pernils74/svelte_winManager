import type { Component } from "svelte";
import ArenaMonitorButtons from "./ArenaMonitorButtons.svelte";
import WindowActions from "./WindowActions.svelte";
import TmpComponent from "./tmp.svelte";

export const windowRegistry = {
  "ArenaMonitorButtons": ArenaMonitorButtons,
  "WindowActions": WindowActions,
  "tmp": TmpComponent,
} as const;

export type ComponentKey = keyof typeof windowRegistry;

export function getComponentByKey(
  key: string | null | undefined,
): Component<any> | null {
  if (!key) return null;
  if (key in windowRegistry) {
    return windowRegistry[key as ComponentKey];
  }
  console.warn(
    `[WindowRegistry] Komponenten "${key}" är inte registrerad i windowRegistry.ts`,
  );
  return null;
}
