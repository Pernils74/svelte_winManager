<!-- WindowHost.svelte -->
<script lang="ts">
import WindowFrame from "./WindowFrame.svelte";
import { getWindowManager, ROOT_WIN_ID } from "./windowManager.svelte";

const wManager = getWindowManager();
let contentEl = $state<HTMLElement | undefined>(undefined);

// Hämta alla fönster som inte är minimerade eller frikopplade
let activeWindows = $derived(
	wManager.windows.filter((win) => win.winId !== ROOT_WIN_ID && !win.state.isMinimized && !win.isDetached),
);
</script>
  
  <!-- Central snippet som renderar ett fönster och dess subfönster rekursivt -->
  {#snippet renderWindow(win)}
    {#if win.component}
      {@const WindowComponent = win.component}
      {@const globalIdx = wManager.windows.findIndex(w => w.winId === win.winId)}
  
      <!-- WindowFrame hanterar BARA ramen, positionen, drag/resize -->
      <WindowFrame {win} bounds={win.parentId === ROOT_WIN_ID ? contentEl : undefined}>
        
        <!-- Här renderas själva applikationskomponenten (fönstrets innehåll) -->
        <WindowComponent
          bind:win={wManager.windows[globalIdx]}
          winId={win.winId}
          parentId={win.parentId}
          {...win.props}
        />
  
        <!-- REKURSION: Om denna komponent i sin tur har underfönster, renderas de här i sin förälders contentEl -->
        {#each wManager.getChildren(win.winId) as child (child.winId)}
          {@render renderWindow(child)}
        {/each}
  
      </WindowFrame>
    {/if}
  {/snippet}
  
  <div class="layout">
	<main class="workspace" bind:this={contentEl}>
      
      <!-- Renderar alla fönster som ligger direkt på rooten -->
      {#each wManager.getChildren(ROOT_WIN_ID) as rootWin (rootWin.winId)}
        {@render renderWindow(rootWin)}
      {/each}
  
    </main>
</div>
