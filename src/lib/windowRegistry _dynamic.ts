import { type Component, createRawSnippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import WindowComponentFallback from "./WindowComponentFallback.svelte.ts";

import WindowA from "../routes/window_A.svelte";
import WindowB from "../routes/window_B.svelte";
import WindowC from "../routes/window_C.svelte";

const windowComponents: Record<string, Component<any>> = {
  window_A: WindowA,
  window_B: WindowB,
  window_C: WindowC,
};

// En dynamisk runtime-karta där öppnade komponenter registreras automatiskt
const dynamicRegistry = new SvelteMap<string, Component<any>>(); //new Map<string, Component<any>>();

/**
 * Registrerar en komponent i runtime
 */
// export function registerComponent(key: string, component: Component<any>) {
//   if (!dynamicRegistry.has(key)) {
//     dynamicRegistry.set(key, component);
//   }
// }

/**
 * Hjälpfunktion som gräver fram det riktiga namnet bakom Sveltes/Vites HMR-wrappers
 */
export function getRealComponentName(component: any): string {
  if (!component) return "UnknownComponent";

  // 1. Kolla om det finns en filnamn-symbol (Svelte 5 standard)
  // Detta kommer att ge oss en sträng som "src/routes/Bom.svelte"
  const symbols = Object.getOwnPropertySymbols(component);
  const filenameSymbol = symbols.find((s) =>
    s.toString() === "Symbol(filename)"
  );

  if (filenameSymbol) {
    const filePath = component[filenameSymbol]; // t.ex. "src/routes/Bom.svelte"
    if (filePath) {
      // Plocka ut bara filnamnet utan sökväg och ändelse (Bom)
      const match = filePath.match(/\/([^/]+)\.svelte$/);
      if (match && match[1]) {
        return match[1];
      }
    }
  }

  // 2. Fallback: Kolla i Symbol(hmr) om den finns
  const hmrSymbol = symbols.find((s) => s.toString() === "Symbol(hmr)");
  if (hmrSymbol && component[hmrSymbol]?.fn) {
    const realFn = component[hmrSymbol].fn;
    if (realFn.name) return realFn.name;
  }

  // 3. Fallback för produktion (där det inte finns några symboler eller wrappers)
  if (
    component.name && component.name !== "wrapper" && component.name !== "Proxy"
  ) {
    return component.name;
  }

  return "UnknownComponent";
}

/**
 * Registrerar en komponent i runtime och packar upp eventuella proxies
 */
export function registerComponent(
  key: string,
  component: Component<any>,
): string {
  // Om nyckeln som skickas in är en wrapper/proxy, leta upp det riktiga namnet istället
  let realKey = key;
  if (key === "Proxy" || key === "Wrapper" || key === "ProxyComponent") {
    realKey = getRealComponentName(component);
  }

  if (!dynamicRegistry.has(realKey)) {
    dynamicRegistry.set(realKey, component);
  }

  return realKey; // Returnera den uppackade, riktiga nyckeln
}

/**
 * Alternativ: Returnerar alla registrerade komponenter som en array av [key, Component] par
 */
export function getAllComponentsAsArray(): [string, Component<any>][] {
  return Array.from(dynamicRegistry.entries());
}

export function getComponentByKey(
  key: string | null | undefined,
): Component<any> {
  if (!key) {
    return WindowComponentFallback;
  }

  const component = dynamicRegistry.get(key);

  if (component) {
    return component;
  }

  console.error(
    `[windowRegistry] Component not registered: "${key}"`,
    "Registered components:",
    getAllComponentsAsArray().map(([registeredKey]) => registeredKey),
  );

  return WindowComponentFallback;
}

export function resolveComponent(key: string | null | undefined) {
  if (!key) {
    return {
      component: WindowComponentFallback,
      missing: true,
      key: "No component key provided",
    };
  }

  const component = dynamicRegistry.get(key);

  if (!component) {
    return {
      component: WindowComponentFallback,
      missing: true,
      key,
    };
  }

  return {
    component,
    missing: false,
    key,
  };
}
