// windowRegistry.ts
import type { Component } from "svelte";
import WindowComponentFallback from "./WindowComponentFallback.svelte";

// 🌟 1. Skanna hela routes-trädet rekursivt (** betyder alla undermappar)
// Vi utgår från src/lib/ och går upp till src/routes/
// const modules = import.meta.glob("../routes/**/*.svelte");

const windowLoaders: Record<string, () => Promise<any>> = {};

// // 🌟 2. Bygg upp registret baserat på hela trädstrukturen
// for (const path in modules) {
//   // path är t.ex: "../routes/window_A.svelte" eller "../routes/admin/tools/Window.svelte"

//   // Ta bort "../routes/" från början och ".svelte" från slutet
//   let cleanPath = path.replace("../routes/", "").replace(".svelte", "");

//   // Skapa en säker strängnyckel genom att byta ut "/" mot "_"
//   // Exempel: "admin/tools/Window" blir "admin_tools_Window"
//   const key = cleanPath.replace(/\//g, "_");

//   windowLoaders[key] = modules[path];
// }

const loadedComponents = new Map<string, Component<any>>();

export type ComponentLoader = () => Promise<any>;

export function registerComponents(
  modules: Record<string, ComponentLoader>,
): void {
  for (const path in modules) {
    const cleanPath = path
      .replace(/^.*routes\//, "")
      .replace(".svelte", "");

    const key = cleanPath.replace(/\//g, "_");

    if (windowLoaders[key]) {
      console.warn(
        `[windowRegistry] Duplicate key: ${key}`,
      );
    }

    windowLoaders[key] = modules[path];
  }
}

/**
 * Hämtar en komponent asynkront baserat på dess genererade strukturnyckel.
 */
export async function getComponentByKey(
  key: string | null | undefined,
): Promise<Component<any>> {
  if (!key) return WindowComponentFallback;

  const loaded = loadedComponents.get(key);
  if (loaded) return loaded;

  const loader = windowLoaders[key];

  if (!loader) {
    console.error(
      `[windowRegistry] Fönster-nyckeln "${key}" hittades inte i trädstrukturen.\n` +
        `Tillgängliga nycklar:`,
      Object.keys(windowLoaders),
    );
    return WindowComponentFallback;
  }

  try {
    const module = await loader();
    const component = module.default;
    loadedComponents.set(key, component);
    return component;
  } catch (error) {
    console.error(
      `[windowRegistry] Misslyckades att läsa in ${key} från disk:`,
      error,
    );
    return WindowComponentFallback;
  }
}

export function getRealComponentName(component: any): string {
  if (!component) return "UnknownComponent";

  const symbols = Object.getOwnPropertySymbols(component);
  const filenameSymbol = symbols.find((s) =>
    s.toString() === "Symbol(filename)"
  );

  if (filenameSymbol) {
    const filePath = component[filenameSymbol]; // T.ex. "src/routes/admin/tools/Window.svelte"
    if (filePath) {
      // Hitta var "src/routes/" eller "routes/" börjar och klipp ut resten fram till ".svelte"
      const routesMatch = filePath.match(/routes\/(.+)\.svelte$/);
      if (routesMatch && routesMatch[1]) {
        // Gör exakt samma transformering: byt "/" mot "_"
        return routesMatch[1].replace(/\//g, "_");
      }
    }
  }

  // Fallback om symboler saknas (t.ex. i produktion)
  if (
    component.name && component.name !== "wrapper" && component.name !== "Proxy"
  ) {
    return component.name;
  }

  return "UnknownComponent";
}

/**
 * Synkron kontroll av komponenten.
 */
export function resolveComponent(key: string | null | undefined) {
  if (!key) {
    return { component: WindowComponentFallback, missing: true, key: "No key" };
  }

  const hasLoader = key in windowLoaders;
  return {
    component: loadedComponents.get(key) ?? null,
    missing: !hasLoader,
    key,
  };
}

/**
 * Returnerar alla genererade nycklar i trädstrukturen.
 */
export function getAllRegisteredKeys(): string[] {
  return Object.keys(windowLoaders);
}
