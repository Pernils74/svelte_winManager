
<script lang="ts">
import { type Component, onMount, type Snippet } from "svelte";
import { page } from "$app/state";

import WindowFrame from "./WindowFrame.svelte";
import { getWindowManager, ROOT_WIN_ID } from "./windowManager.svelte";
import { getComponentByKey } from "./windowRegistry";

interface Props {
  children?: Snippet;
  topbarContent?: Snippet;
}

let { children, topbarContent }: Props = $props();

const wManager = getWindowManager();

// URL-parametrar för ett fristående fönster.
let standaloneWinId = $derived(
  page.url.searchParams.get("winId"),
);

let standaloneComponentKey = $derived(
  page.url.searchParams.get("componentKey"),
);

let standaloneTitle = $derived(
  page.url.searchParams.get("title") ?? "Fristående",
);

let isStandalone = $derived(
  !!(standaloneWinId && standaloneComponentKey),
);

// Komponenten laddas asynkront från windowRegistry.
let standaloneComponent = $state<Component<any> | null>(null);
let standaloneLoading = $state(false);
let standaloneError = $state<string | null>(null);

let contentEl = $state<HTMLElement | undefined>(undefined);

let winCount = $derived(wManager.winCount);

let minimizedWindows = $derived(
  wManager.windows.filter(
    (win) =>
      win.winId !== ROOT_WIN_ID &&
      win.state.isMinimized,
  ),
);

// let rootWindows = $derived(
//   wManager.getChildren(ROOT_WIN_ID),
// );

let rootWindows = $derived(
  wManager.getChildren(ROOT_WIN_ID).filter(
    (win) => !win.isDetached,
  ),
);

// Ladda komponenten och skapa fristående fönsterinstans.
$effect(() => {
  if (
    !isStandalone ||
    !standaloneWinId ||
    !standaloneComponentKey
  ) {
    standaloneComponent = null;
    standaloneError = null;
    standaloneLoading = false;
    return;
  }

  const targetWinId = standaloneWinId;
  const componentKey = standaloneComponentKey;
  const title = standaloneTitle;

  let cancelled = false;
  let unsubscribe: (() => void) | undefined;

  standaloneComponent = null;
  standaloneError = null;
  standaloneLoading = true;

  async function initializeStandaloneWindow() {
    try {
      // getComponentByKey är asynkron med import.meta.glob().
      const component = await getComponentByKey(componentKey);

      if (cancelled) return;

      standaloneComponent = component;

      let winInstance = wManager.find(targetWinId);

      if (!winInstance) {
        winInstance = {
          winId: targetWinId,
          title,
          componentKey,
          component,
          thumbnail: null,
          props: {},
          parentId: null,
          boundingEl: null,
          state: {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
            isMinimized: false,
            isMaximized: true,
            transparency: 1,
          },
          storedState: null,
          zIndex: 1,
          tileOffset: 0,
          showButtons: false,
          docking: {},
          payload: null,
          isDetached: true,
          context: { type: "browser-tab" },
        };

        wManager.windows.push(winInstance);
      } else {
        // Säkerställ att instansen använder den laddade komponenten.
        winInstance.component = component;
        winInstance.componentKey = componentKey;
        winInstance.title = title;
      }

      if (cancelled) return;

      // Lyssna efter initial payload och framtida uppdateringar.
      unsubscribe = wManager.backend.onMessage(
        targetWinId,
        (incomingPayload) => {
          if (cancelled) return;
          // 🟢 Använd den säkra updatePayload-metoden istället för direkt tilldelning
          wManager.updatePayload(targetWinId, incomingPayload);
          // const current = wManager.find(targetWinId);
          // if (current) {
          //   current.payload = incomingPayload;
          // }
        },
      );
    } catch (error) {
      if (cancelled) return;

      console.error(
        `[WindowHost] Kunde inte initiera "${componentKey}"`,
        error,
      );

      standaloneError = error instanceof Error
        ? error.message
        : "Okänt fel vid laddning av fönsterkomponenten.";
    } finally {
      if (!cancelled) {
        standaloneLoading = false;
      }
    }
  }

  void initializeStandaloneWindow();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
});

onMount(() => {
  if (!contentEl) return;
  const updateBounds = () => {
    if (!contentEl) return;
    wManager.setRootBounds(
      contentEl.clientWidth,
      contentEl.clientHeight,
    );
  };

  updateBounds();

  const observer = new ResizeObserver(updateBounds);
  observer.observe(contentEl);

  return () => observer.disconnect();
});
</script>





{#if isStandalone}
  <div class="standalone-container">
    {#if standaloneLoading}
      <div class="loading">
        Laddar fristående komponent...
      </div>
    {:else if standaloneError}
      <div class="loading error">
        <h2>Fönstret kunde inte laddas</h2>
        <p>{standaloneError}</p>
        <p>Komponentnyckel: {standaloneComponentKey}</p>
      </div>
    {:else if standaloneComponent && standaloneWinId}


      {@const winInstance = wManager.find(standaloneWinId)}
      {#if winInstance}
        {@const ComponentToRender = standaloneComponent}

 <!-- 🟢 NYTT: Starta en effekt inuti fliken som strömmar mutationer tillbaka till main-appen -->
        {@render standaloneStreamer(winInstance)}

        <ComponentToRender
          win={winInstance}
          winId={winInstance.winId}
          parentId={winInstance.parentId}
          payload={winInstance.payload}
          {...winInstance.props}
        />



      {:else}
        <div class="loading">
          Fönsterinstansen kunde inte hittas.
        </div>
      {/if}
    {:else}
      <div class="loading">
        Komponenten kunde inte laddas.
      </div>
    {/if}
  </div>
{:else}
  <div class="layout">
    <header class="topbar">
      {#if topbarContent}
        {@render topbarContent()}
      {/if}

      <span>Current open windows: {winCount}</span>
    </header>




<!-- Lägg till detta snippet längst ner i din WindowHost eller i script-delen -->
{#snippet standaloneStreamer(win: any)}
  {#key win.winId}
    {@const effectHook = $effect(() => {
      if (win.payload) {
        const currentPayload = $state.snapshot(win.payload);
        const cleanPayload = Object.fromEntries(
          Object.entries(currentPayload ?? {}).filter(([, val]) => typeof val !== "function")
        );
        // Strömma tillbaka till BroadcastChannel / Tauri Event
        wManager.backend.send(win.winId, cleanPayload);
      }
    })}
  {/key}
{/snippet}


    <main class="workspace" bind:this={contentEl}>
      {#if contentEl}
        {#each rootWindows as win (win.winId)}
          {#if !win.state.isMinimized}
            <WindowFrame {win} bounds={contentEl}>
              {#if win.component}
                {@const WindowComponent = win.component}

                <WindowComponent
                  win={win}
                  winId={win.winId}
                  parentId={win.parentId}
                  {...win.props}
                />
              {/if}
            </WindowFrame>
          {/if}
        {/each}
      {/if}

      {#if children}
        {@render children()}
      {/if}
    </main>





    {#if minimizedWindows.length > 0}
      <footer class="taskbar">
        <span class="taskbar-label">Minimerade fönster</span>

        {#each minimizedWindows as win (win.winId)}
          <div class="task-item">
            <button
              type="button"
              class="task-btn"
              aria-label={`Återställ ${win.title}`}
              onclick={() => wManager.restore(win)}
            >
              <span class="task-icon" aria-hidden="true">◫</span>
              <span class="task-title">{win.title}</span>
            </button>

            <div class="thumbnail-popup" aria-hidden="true">
              <div class="thumbnail-heading">{win.title}</div>

              {#if win.thumbnail}
                <img
                  class="thumbnail-image"
                  src={win.thumbnail}
                  alt=""
                />
              {:else}
                <div class="thumbnail-placeholder">
                  Förhandsvisning saknas
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </footer>
    {/if}
  </div>
{/if}

<style>
.standalone-container {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: #1e1e1e;
  overflow: auto;
}

.loading {
  color: white;
  display: grid;
  place-content: center;
  gap: 0.75rem;
  min-height: 100%;
  padding: 1.5rem;
  box-sizing: border-box;
  font-family: sans-serif;
  text-align: center;
}

.error {
  color: #ffb4b4;
}

.layout {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 2px solid black;
  box-sizing: border-box;
}

.topbar {
  position: relative;
  z-index: 10;
  flex: 0 0 2.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 0.75rem;
  background: lightblue;
  border-bottom: 1px solid #999;
}

.workspace {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  isolation: isolate;
}

.taskbar {
  position: relative;
  z-index: 100;
  flex: 0 0 2.5rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.75rem;
  background: #c1414165;
  border-top: 1px solid #999;
  overflow: visible;
}

.taskbar-label {
  margin-right: 0.5rem;
  white-space: nowrap;
  color: white;
}

.task-item {
  position: relative;
  align-self: stretch;
  display: flex;
  align-items: center;
}

.task-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  height: 2rem;
  max-width: 180px;
  padding: 0 0.65rem;
  border: 1px solid #777;
  border-radius: 5px;
  background: #ffffffd9;
  color: #222;
  cursor: pointer;
}

.task-btn:hover,
.task-btn:focus-visible {
  background: white;
  border-color: #3578c7;
}

.task-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: #dce9fa;
  font-size: 1.1rem;
}

.task-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.thumbnail-popup {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.6rem);
  z-index: 1000;
  width: 280px;
  padding: 8px;
  border: 1px solid #b7b7b7;
  border-radius: 9px;
  background: #f8f8f8;
  box-shadow: 0 8px 28px rgb(0 0 0 / 24%);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate(-50%, 8px) scale(0.97);
  transform-origin: bottom center;
  transition:
    opacity 140ms ease,
    transform 140ms ease,
    visibility 140ms ease;
}

.task-item:hover .thumbnail-popup,
.task-item:focus-within .thumbnail-popup {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0) scale(1);
}

.thumbnail-heading {
  padding: 3px 4px 8px;
  color: #222;
  font-size: 0.85rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumbnail-image,
.thumbnail-placeholder {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  box-sizing: border-box;
  background: #e6e6e6;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.thumbnail-image {
  object-fit: contain;
}

.thumbnail-placeholder {
  display: grid;
  place-content: center;
  border-style: dashed;
  color: #666;
  font-size: 0.8rem;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .thumbnail-popup {
    transition: none;
  }
}
</style>
