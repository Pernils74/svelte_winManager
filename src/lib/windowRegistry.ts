// import type { Component } from "svelte";

// import ArenaMonitorButtons from "./ArenaMonitorButtons.svelte";
// import WindowActions from "./WindowActions.svelte";
// // import TmpComponent from "./tmp";

// export const windowRegistry = {
//   "ArenaMonitorButtons": ArenaMonitorButtons,
//   "WindowActions": WindowActions,
//   // "tmp": TmpComponent,
// } as const;

// export type ComponentKey = keyof typeof windowRegistry;

// export function getComponentByKey(
//   key: string | null | undefined,
// ): Component<any> | null {
//   if (!key) return null;
//   if (key in windowRegistry) {
//     return windowRegistry[key as ComponentKey];
//   }
//   console.warn(
//     `[WindowRegistry] Komponenten "${key}" är inte registrerad i windowRegistry.ts`,
//   );
//   return null;
// }

import { type Component, createRawSnippet } from "svelte";

// En dynamisk runtime-karta där öppnade komponenter registreras automatiskt
const dynamicRegistry = new Map<string, Component<any>>();

/**
 * Registrerar en komponent i runtime
 */
export function registerComponent(key: string, component: Component<any>) {
  if (!dynamicRegistry.has(key)) {
    dynamicRegistry.set(key, component);
  }
}

/**
 * Hämtar en komponent baserat på dess textnyckel.
 * Om den saknas returneras en visuell felsökningskomponent (popup/fallback).
 */
export function getComponentByKey(
  key: string | null | undefined,
): Component<any> {
  if (!key) return createFallbackComponent("Inget fönster-ID angavs");

  // 1. Kolla om den finns i vårt dynamiska register
  if (dynamicRegistry.has(key)) {
    return dynamicRegistry.get(key)!;
  }

  // 2. Fallback: Om den saknas, returnera en hjälpsam Svelte-komponent runtime
  return createFallbackComponent(key);
}

/**
 * Genererar en Svelte 5-komponent som visar ett felmeddelande i fönstret
 */
function createFallbackComponent(componentKey: string): Component<any> {
  // Vi skapar en rå rendering för Svelte 5 som ritar ut ett felmeddelande
  return new Proxy({}, {
    get() {
      return (internals: any, props: any) => {
        const div = document.createElement("div");
        div.style.padding = "20px";
        div.style.background = "#fff0f0";
        div.style.border = "2px dashed #ff4d4d";
        div.style.borderRadius = "8px";
        div.style.color = "#cc0000";
        div.style.fontFamily = "sans-serif";
        div.style.margin = "15px";

        div.innerHTML = `
          <h3 style="margin-top:0;">⚠️ Fönster-komponent saknas</h3>
          <p>Kunde inte ladda komponenten: <strong>"${componentKey}"</strong></p>
          <p style="font-size: 0.9em; color: #555;">
            <strong>Lösning:</strong> Om detta är en ny flik eller ett Tauri-fönster, 
            måste komponenten inkluderas i ditt huvudregister så att det nya JavaScript-kontextet känner till den.
          </p>
        `;
        return { c: () => {}, d: () => div };
      };
    },
  }) as Component<any>;
}
