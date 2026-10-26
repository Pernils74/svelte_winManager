import type { Component } from "svelte";
import WindowComponentFallback from "./WindowComponentFallback.svelte";

// Typ för de asynkrona dynamiska importerna
type WindowLoader = () => Promise<{ default: Component<any> }>;

// 1. STATISKT REGISTER: Lägg till dina fönster här.
// Det gör att nya flikar/Tauri-fönster alltid hittar rätt komponent via sin strängnyckel.
const windowLoaders: Record<string, WindowLoader> = {
  window_A: () => import("../routes/window_A.svelte"),
  window_B: () => import("../routes/window_B.svelte"),
  window_C: () => import("../routes/window_C.svelte"),
};

// Cache för redan laddade komponenter så vi slipper importera samma fil flera gånger
const loadedComponents = new Map<string, Component<any>>();

/**
 * Hämtar en komponent asynkront baserat på dess strängnyckel.
 * Om komponenten saknas eller misslyckas att ladda returneras en Fallback-komponent.
 */
export async function getComponentByKey(
  key: string | null | undefined,
): Promise<Component<any>> {
  if (!key) return WindowComponentFallback;

  // Returnera från cache om den redan har laddats en gång
  const loaded = loadedComponents.get(key);
  if (loaded) return loaded;

  const loader = windowLoaders[key];

  // DEV MODE ALERT: Om komponenten inte finns i det statiska registret
  if (!loader) {
    console.error(
      `[windowRegistry] ⚠ Komponenten "${key}" saknas i registret! Kom ihåg att lägga till den i 'windowLoaders' inuti windowRegistry.ts.`,
    );
    return WindowComponentFallback;
  }

  try {
    const module = await loader();
    loadedComponents.set(key, module.default);
    return module.default;
  } catch (error) {
    console.error(
      `[windowRegistry] Misslyckades att ladda komponenten "${key}":`,
      error,
    );
    return WindowComponentFallback;
  }
}

/**
 * Synkron kontroll för att se om en nyckel är giltig och registrerad.
 * Eftersom imports är asynkrona kollar denna mot registret (windowLoaders) snarare än färdigladdade komponenter.
 */
export function resolveComponent(key: string | null | undefined): {
  component: Component<any> | null;
  missing: boolean;
  key: string;
} {
  if (!key) {
    return {
      component: WindowComponentFallback,
      missing: true,
      key: "No component key provided",
    };
  }

  // Kolla om nyckeln överhuvudtaget existerar i vår statiska definition
  const hasLoader = key in windowLoaders;
  const cachedComponent = loadedComponents.get(key);

  if (!hasLoader) {
    return {
      component: WindowComponentFallback,
      missing: true,
      key,
    };
  }

  return {
    // Returnera cachen om den finns, annars null (eftersom getComponentByKey måste kallas asynkront för att ladda filen)
    component: cachedComponent ?? null,
    missing: false,
    key,
  };
}

/**
 * Returnerar en array med namnen på alla registrerade fönster.
 * Nyttigt för menyer eller felsökning.
 */
export function getAllRegisteredKeys(): string[] {
  return Object.keys(windowLoaders);
}
