<!--

https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/WindowFrame.svelte
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/WindowHost.svelte
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/windowManager.svelte.ts



https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/windowRegistry.ts
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/windowBackend.ts

-->

<!-- gammalt ...
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/tauriWindowBackend.ts
https://github.com/Pernils74/svelte_winManager/blob/main/src/lib/browserTabBackend.ts -->

<!-- +page.svelte -->
<script lang="ts">
import { onMount } from "svelte";
import Wallpaper from "#lib/Wallpaper.svelte";

//   import ArenaMonitorButtons from '$lib/ArenaMonitorButtons.svelte';
import WindowHost from "#lib/WindowHost.svelte";

import { initializeWindowManager } from "#lib/windowManager.svelte.ts";
import { getAllComponentsAsArray } from "#lib/windowRegistry.ts";
//   import Item from './Item.svelte';
import Bom from "./Bom.svelte";
import ArenaMonitorButtons from "#lib/ArenaMonitorButtons.svelte";
import BomActions from "./BomActions.svelte";
//   import Scrapping from './Scrapping/Scrapping.svelte';

const wManager = initializeWindowManager();

onMount(() => {
  wManager.open(Bom, {
    title: "🪟 Bom Window",
    extraHeight: 40,
    width: 700,
    height: 600,
    actions: ArenaMonitorButtons,
  });
  wManager.open(Bom, {
    title: "🪟 Bom Window",
    width: 700,
    height: 600,
    extraHeight: 4,
    actions: BomActions,
  });
});

const allComponents = $derived(getAllComponentsAsArray());
$effect(() => {
  console.log(allComponents);
});
</script>

<WindowHost>
  {#snippet children()}
<h1>Welcome to SvelteKit</h1>
  <p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
  
  5. src/routes/+page.svelte
  
  Nu blir startsidan betydligt enklare. Den behöver bara initiera context och välja vilka fönster som ska öppnas initialt.
  svelte
  <h3>Registrerade komponenter i systemet:</h3>
  <ul>
    <!-- Vi destrukturerar [key, value] från din Map-array -->
    {#each allComponents as [key, component]}
      <li>Nyckel: <strong>{key}</strong></li>
    {/each}
  </ul>

  <Wallpaper word="page.svelte"></Wallpaper>
    <!-- Eventuellt permanent innehåll i arbetsytan -->
  {/snippet}
</WindowHost>

<style>
:global(html),
:global(body) {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}
</style>

<!--
Startsidan behöver inte längre importera DraggableResizable, ha en contentEl eller själv iterera över alla fönster.
6. Öppna fönster från andra komponenter

Från exempelvis Bom.svelte kan du öppna ett nytt fönster på samma sätt som tidigare:
svelte

<script lang="ts">
  import { getWindowManager } from '$lib/windowManager.svelte';
  import Item from '../Item.svelte';
  import Scrapping from '../Scrapping/Scrapping.svelte';

  const wManager = getWindowManager();

  function openItem() {
    wManager.open(Item, {
      title: '🪟 Item Window',
      width: 400,
      height: 300,
      props: { art_nr: '12345' }
    });
  }

  function openScrapping() {
    wManager.open(Scrapping, {
      title: '👁️ Scrapping Window'
    });
  }
</script>

<button onclick={openItem}>Ny item</button>
<button onclick={openScrapping}>Scrapping</button>

7. Så använder du payload och state

Det är värt att skilja på de två begreppen:
ts

const win = wManager.open(Item, {
  title: 'Item',
  payload: {
    selectedArticle: '12345',
    searchTerm: ''
  }
});

// Ändra fönstrets UI-tillstånd
wManager.update(win.winId, {
  left: 100,
  top: 80,
  isMinimized: false
});

// Ändra dess applikationsdata
wManager.updatePayload(win.winId, {
  selectedArticle: '67890',
  searchTerm: 'motor'
});

state ska vara den reaktiva information som behövs för att visa och styra fönstret. payload är data som hör till själva applikationsfunktionen. Om du behöver reaktivt uppdatera egenskaper inuti ett godtyckligt payload-objekt bör du definiera det som en egen reaktiv modell, i stället för att låta window manager hantera all möjlig applikationsdata.
8. Några saker att vara uppmärksam på

Den här refaktoreringen är en grundstruktur och behöver verifieras mot dina befintliga komponenter innan den ersätter koden rakt av.

    ArenaMonitorButtons.svelte: Om den använder win.useArena eller win.useMonitor behöver den uppdateras så att den läser och skriver rätt tillstånd i den nya modellen.

    Initial storlek: WindowFrame mäter komponentens DOM efter montering. Om innehållet laddas asynkront kan du behöva en ResizeObserver för att beräkna en lämplig initial storlek.

    Barnfönster: parentId finns kvar, men barnfönster renderas fortfarande i samma host. Om de ska begränsas till föräldrafönstrets innehållsyta behöver hosten även hantera olika bounding-element.

    Maximering: Här maximeras fönstret inom arbetsytan. Om arbetsytan ändrar storlek medan fönstret är maximerat behöver storleken uppdateras.

    Svelte 5: Exemplet använder snippets och $state i stället för äldre slot-mönster och Svelte 4:s komponentkonventioner.

Min rekommendation: Börja med att få WindowManager, WindowHost och WindowFrame att fungera tillsammans. Därefter kan vi göra ArenaMonitorButtons och barnfönster helt konsekventa med den nya modellen. Det ger en renare arkitektur utan att du behöver skriva om Bom, Item och Scrapping från grunden.
-->
