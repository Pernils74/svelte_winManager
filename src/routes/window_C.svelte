
bom bla dkjsdk
 <!-- Bom.svelte -->
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
const wManager = getWindowManager();

import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
let { win, winId, parentId }: WindowComponentProps = $props();

// import Item from '../Item.svelte';
import Scrapping from "./Scrapping.svelte";
import MouseCords from "./MouseCords.svelte";

import Window_A from "./window_A.svelte";
import Window_B from "./window_B.svelte";

const parent = $derived(wManager.find(winId));

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
  if (win2) wManager.reparent(win2.winId, "root");
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
