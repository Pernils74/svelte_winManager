import { type Component, createRawSnippet } from "svelte";
import { SvelteMap } from "svelte/reactivity";

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
