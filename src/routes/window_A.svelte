<!-- Bom.svelte -->
<script lang="ts">
import Wallpaper from "#lib/Wallpaper.svelte";
import { getWindowManager } from "#lib/windowManager.svelte.ts";
const wManager = getWindowManager();

import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
let { win, winId, parentId }: WindowComponentProps = $props();

// import Item from '../Item.svelte';
import Scrapping from "./Scrapping.svelte";
import MouseCords from "./MouseCords.svelte";

import Window_A_Titlebar from "./window_A_titlebar.svelte";

import Window_B from "./window_B.svelte";
import Window_C from "./window_C.svelte";
import { onMount } from "svelte";

const parent = $derived(wManager.find(winId));

onMount(() => {
  // console.log("wins ", win);
  // win;
});

function openItem() {
  wManager.open(Scrapping, {
    parentId: winId,
    title: "🪟 Item Window",
    width: 400,
    height: 300,
    props: { art_nr: "12345" },
  });
}

function openWindow_B() {
  wManager.open(Window_B, {
    parentId: winId,
    title: "🪟 Window_B",
    width: 400,
    height: 300,
    props: { art_nr: "12345" },
  });
}

function reparent() {
  wManager.reparent(win.winId, "root");
}

function openScrapping() {
  wManager.open(Scrapping, {
    title: "👁️ Scrapping Window",
  });
}
</script>

<MouseCords />
<button onclick={openWindow_B}>Open Widow B</button>
<button onclick={openScrapping}>Scrapping</button>

<h3>Current window...</h3>
<p> winParent: <strong>{win.parentId} </strong> </p>
<p> winId:     <strong> {winId}</strong></p>

<!-- Current winTitle: {win.title} -->
<button onclick={reparent}>Switch parent to root</button>
<Wallpaper word="Window A"></Wallpaper>
