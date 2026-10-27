// import adapter from '@sveltejs/adapter-auto';

// vite.config.js
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite"; // 🌟 NYTT: Importera loadEnv

export default defineConfig(({ command, mode }) => {
  const isDev = command === "serve";

  // 🌟 NYTT: Ladda miljövariabler utan att använda 'process.env'
  const env = loadEnv(mode, globalThis.process?.cwd?.() || ".");
  const basePath = env.BASE_PATH || "/svelte_winManager";

  return {
    // 🌟 ÄNDRAT: Använder nu variabeln från loadEnv
    base: isDev ? "" : basePath,

    plugins: [
      sveltekit({
        compilerOptions: {
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
        },
        adapter: adapter({
          pages: "dist",
          assets: "dist",
          fallback: "404.html",
          precompress: false,
          strict: true,
        }),
      }),
    ],
    build: {
      rolldownOptions: {
        external: ["@tauri-apps/api/webviewWindow", "@tauri-apps/api"],
      },
    },
  };
});
