
bom bla dkjsdk
 <!-- Bom.svelte -->
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
// import Item from '../Item.svelte';
import Scrapping from "./Scrapping.svelte";
import MouseCords from "./MouseCords.svelte";

const wManager = getWindowManager();

let {
  winId,
  parentId,
}: {
  winId: string;
  parentId: string | null;
} = $props();

const parent = wManager.find(winId);

function openItem() {
  wManager.open(Scrapping, {
    parentId: winId,
    // boundingEl: parent.boundingEl,
    title: "🪟 Item Window",
    width: 400,
    height: 300,
    props: { art_nr: "12345" },
  });
}

function reparent() {
  let win2 = wManager.findByTitle("🪟 Item Window");
  wManager.reparent(win2?.winId, "root");
}

function openScrapping() {
  wManager.open(Scrapping, {
    title: "👁️ Scrapping Window",
  });
}
</script>
  <MouseCords />
  <button onclick={openItem}>Ny item</button>
  <button onclick={openScrapping}>Scrapping</button>
  <button onclick={reparent}>Byta parent</button>
