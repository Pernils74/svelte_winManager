<script lang="ts">
import { onMount, type Snippet } from "svelte";
import WindowFrame from "./WindowFrame.svelte";
import { getWindowManager, ROOT_WIN_ID } from "./windowManager.svelte";
import { getComponentByKey } from "./windowRegistry";
import { page } from "$app/state";

interface Props {
  children?: Snippet;
  topbarContent?: Snippet;
}

let { children, topbarContent }: Props = $props();
const wManager = getWindowManager();

// 🟢 REAKTIVA SVELTE 5 RUNOR: Hämtar parametrar direkt från SvelteKits router i realtid
let standaloneWinId = $derived(page.url.searchParams.get("winId"));
let standaloneComponentKey = $derived(
  page.url.searchParams.get("componentKey"),
);
let standaloneTitle = $derived(
  page.url.searchParams.get("title") ?? "Fristående",
);

// Avgör om vi är ett fristående fönster och vilken komponent som ska laddas
let isStandalone = $derived(!!(standaloneWinId && standaloneComponentKey));
let StandaloneComponent = $derived(getComponentByKey(standaloneComponentKey));

let contentEl = $state<HTMLElement | undefined>(undefined);
let winCount = $derived(wManager.winCount);

let minimizedWindows = $derived(
  wManager.windows.filter(
    (win) => win.winId !== ROOT_WIN_ID && win.state.isMinimized,
  ),
);
let rootWindows = $derived(wManager.getChildren(ROOT_WIN_ID));

// 🟢 REAKTIV SYNK: Lyssnar på meddelanden så fort det fristående fönstret vaknar till liv
$effect(() => {
  if (isStandalone && standaloneWinId) {
    const targetWinId = standaloneWinId;
    let localWin = wManager.find(targetWinId);

    if (!localWin) {
      // Registrera lyssnaren för inkommande payloads via BroadcastChannel/Tauri
      const unsubscribe = wManager.backend.onMessage(
        targetWinId,
        (incomingPayload) => {
          const win = wManager.find(targetWinId);
          if (win) {
            win.payload = incomingPayload;
          } else {
            // Skapa instansen i det nya JavaScript-kontextets minne
            wManager.windows.push({
              winId: targetWinId,
              title: standaloneTitle,
              thumbnail: null,
              component: null,
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
              payload: incomingPayload,
            });
          }
        },
      );

      return () => unsubscribe();
    }
  }
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
  <!-- Fristående läge: visa endast komponenten -->
  <div class="standalone-container">
    {#if StandaloneComponent && standaloneWinId}
      {@const winInstance = wManager.find(standaloneWinId)}

      {#if winInstance}
        {@const ComponentToRender = StandaloneComponent}
        <ComponentToRender
          win={ComponentToRender}
          winId={standaloneWinId}
          payload={winInstance.payload}
          {...winInstance.props}
        />
      {:else}
        <div class="loading">
          Fönstret kunde inte hittas.
        </div>
      {/if}
    {:else}
      <div class="loading">
        Laddar fristående komponent...
      </div>
    {/if}
  </div>
{:else}
  <!-- Vanligt skrivbordsläge -->
  <div class="layout">
    <header class="topbar">
      {#if topbarContent}
        {@render topbarContent()}
      {/if}

      <span>Current open windows: {winCount}</span>
    </header>

    <main class="workspace" bind:this={contentEl}>
      {#if contentEl}
        {#each rootWindows as win (win.winId)}
          {#if !win.state.isMinimized}
            <WindowFrame win={win} bounds={contentEl}>
              {#if win.component}
                {@const Component = win.component}

                <Component
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



    <!-- Aktivitetsfält endast för minimerade huvudfönster -->
    <!-- {@const rootMinimized = wManager.windows.filter(      (w) => w.parentId === ROOT_WIN_ID && w.state.isMinimized    )}
    {#if rootMinimized.length > 0} -->


    {#if wManager.windows.some((w) => w.parentId === ROOT_WIN_ID && w.state.isMinimized)}
    {@const rootMinimized = wManager.windows.filter((w) => w.parentId === ROOT_WIN_ID && w.state.isMinimized)}
      <footer class="taskbar">
        <span class="taskbar-label">Skrivbord</span>

        {#each rootMinimized as win (win.winId)}
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

            <!-- Förhandsvisning vid hover, styrs av CSS -->
            <div class="thumbnail-popup" aria-hidden="true">
              <div class="thumbnail-heading">
                {win.title}
              </div>

              {#if win.thumbnail}
                <img class="thumbnail-image" src={win.thumbnail} alt="" />
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
  height: 100%;
  font-family: sans-serif;
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
  padding: 3 px 4 px 8 px;
  color: #222;
  font-size: 0.85 rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thumbnail-image {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: contain;
  background: #e6e6e6;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.thumbnail-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: #e6e6e6;
  border: 1px dashed #aaa;
  border-radius: 4px;
  color: #666;
  font-size: 0.8rem;
}

.placeholder-icon {
  font-size: 2rem;
}

@media (prefers-reduced-motion: reduce) {
  .thumbnail-popup {
    transition: none;
  }
}
</style>
