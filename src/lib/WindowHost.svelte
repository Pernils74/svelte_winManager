<script lang="ts">
import { onMount, type Snippet } from "svelte";
import WindowFrame from "./WindowFrame.svelte";
import { getWindowManager, ROOT_WIN_ID } from "./windowManager.svelte";

interface Props {
  children?: Snippet;
  topbarContent?: Snippet;
}

let { children, topbarContent }: Props = $props();

const wManager = getWindowManager();

let contentEl = $state<HTMLElement | undefined>(undefined);

let winCount = $derived(wManager.winCount);
let minimizedWindows = $derived(
  wManager.windows.filter(
    (win) => win.winId !== ROOT_WIN_ID && win.state.isMinimized,
  ),
);
let rootWindows = $derived(wManager.getChildren(ROOT_WIN_ID));

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

<div class="layout">
  <header class="topbar">
    {#if topbarContent}
      {@render topbarContent()}
    {/if}

    <span>Antal öppna fönster: {winCount}</span>
  </header>

  <main class="workspace" bind:this={contentEl}>
    {#if contentEl}
      {#each rootWindows as win (win.winId)}
        {#if !win.state.isMinimized}
          <WindowFrame win={win} bounds={contentEl}>
            {#if win.component}
              {@const Component = win.component}
              <Component
                winId={win.winId}
                {...win.props}
                parentId={win.parentId}
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

  <footer class="taskbar">
    <span>Taskbar</span>

    {#each minimizedWindows as win (win.winId)}
      <button
        type="button"
        class="task-btn"
        onclick={() => wManager.restore(win.winId)}
      >
        🔼 {win.title}
      </button>
    {/each}
  </footer>
</div>

<style>
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
  z-index: 10;
  flex: 0 0 2.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
  background: #c1414165;
  border-top: 1px solid #999;
}

.task-btn {
  cursor: pointer;
}
</style>
