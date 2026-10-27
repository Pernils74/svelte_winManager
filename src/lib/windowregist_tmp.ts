// src/lib/windowRegistry.ts
import type { Component } from "svelte";
import WindowComponentFallback from "./WindowComponentFallback.svelte";

// 🌟 VITE-MAGI: Denna rad skannar automatiskt av hela din routes-mapp (och undermappar)
// efter alla .svelte-filer och skapar asynkra loaders automatiskt.
const modules = import.meta.glob("../routes/**/*.svelte");

const windowLoaders: Record<string, () => Promise<any>> = {};

// Bygg upp registret automatiskt baserat på filnamnen
for (const path in modules) {
  // Extrahera filnamnet (t.ex. "../routes/window_A.svelte" -> "window_A")
  const match = path.match(/\/([^/]+)\.svelte$/);
  if (match && match[1]) {
    const key = match[1];
    windowLoaders[key] = modules[path];
  }
}

const loadedComponents = new Map<string, Component<any>>();

export async function getComponentByKey(
  key: string | null | undefined,
): Promise<Component<any>> {
  if (!key) return WindowComponentFallback;

  const loaded = loadedComponents.get(key);
  if (loaded) return loaded;

  const loader = windowLoaders[key];
  if (!loader) {
    console.error(
      `[windowRegistry] "${key}" hittades inte av Vites automatiska skanning.`,
    );
    return WindowComponentFallback;
  }

  try {
    const module = await loader();
    // Hantera Svelte 5 standard export default
    const component = module.default;
    loadedComponents.set(key, component);
    return component;
  } catch (error) {
    console.error(`[windowRegistry] Fel vid laddning av ${key}:`, error);
    return WindowComponentFallback;
  }
}
