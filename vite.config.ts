// import adapter from '@sveltejs/adapter-auto';

// vite.config.js
// vite.config.js
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Tvingar runes mode för projektet
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules")
						? undefined
						: true,
			},

			// I SvelteKit 3 flyttas adapter ut från "kit"-objektet till rot-nivån
			adapter: adapter({
				pages: "build",
				assets: "build",
				fallback: "index.html", // Krävs för Tauri
				precompress: false,
				strict: true,
			}),
		}),
	],
});
