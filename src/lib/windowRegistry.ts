// windowRegistry.ts

import type { Component } from "svelte";
import WindowComponentFallback from "./WindowComponentFallback.svelte";

export type ComponentLoader = () => Promise<any>;

const windowLoaders: Record<string, ComponentLoader> = {};

// key -> component
const loadedComponents = new Map<string, Component<any>>();

// component -> key
const loadedKeys = new WeakMap<Component<any>, string>();

// export function registerComponents(
//   modules: Record<string, ComponentLoader>,
// ): void {
//   for (const path in modules) {
//     const cleanPath = path
//       .replace(/^.*routes\//, "")
//       .replace(/\.svelte$/, "");

//     const key = cleanPath.replace(/\//g, "_");

//     if (windowLoaders[key]) {
//       console.warn(
//         `[windowRegistry] Duplicate key detected: ${key}`,
//       );
//     }

//     windowLoaders[key] = modules[path];
//   }
// }

export function registerComponents(
  modules: Record<string, any>,
): void {
  for (const path in modules) {
    const cleanPath = path
      .replace(/^.*routes\//, "")
      .replace(/\.svelte$/, "");

    const key = cleanPath.replace(/\//g, "_");

    const component = modules[path].default;

    loadedComponents.set(key, component);
    loadedKeys.set(component, key);
  }
}

/**
 * Hämta key från en redan laddad komponent.
 */
export function getComponentKey(
  component: Component<any>,
): string | undefined {
  return loadedKeys.get(component);
}

/**
 * Ladda komponent från key.
 */
export async function getComponentByKey(
  key: string | null | undefined,
): Promise<Component<any>> {
  if (!key) {
    return WindowComponentFallback;
  }

  const cached = loadedComponents.get(key);

  if (cached) {
    return cached;
  }

  const loader = windowLoaders[key];

  if (!loader) {
    console.error(
      `[windowRegistry] No component registered for key "${key}"`,
      Object.keys(windowLoaders),
    );

    return WindowComponentFallback;
  }

  try {
    const module = await loader();

    const component = module.default as Component<any>;

    loadedComponents.set(key, component);
    loadedKeys.set(component, key);

    return component;
  } catch (error) {
    console.error(
      `[windowRegistry] Failed loading "${key}"`,
      error,
    );

    return WindowComponentFallback;
  }
}

/**
 * Om komponenten redan är känd i registret.
 */
export async function preloadAllComponents(): Promise<void> {
  const entries = Object.entries(windowLoaders);

  await Promise.all(
    entries.map(async ([key, loader]) => {
      if (loadedComponents.has(key)) {
        return;
      }

      try {
        const module = await loader();

        const component = module.default as Component<any>;

        loadedComponents.set(key, component);
        loadedKeys.set(component, key);
      } catch (err) {
        console.error(
          `[windowRegistry] Failed preloading "${key}"`,
          err,
        );
      }
    }),
  );
}

export function resolveComponent(
  key: string | null | undefined,
) {
  if (!key) {
    return {
      component: WindowComponentFallback,
      missing: true,
      key: "No key",
    };
  }

  return {
    component: loadedComponents.get(key) ?? null,
    missing: !(key in windowLoaders),
    key,
  };
}

export function getAllRegisteredKeys(): string[] {
  return Object.keys(windowLoaders);
}
