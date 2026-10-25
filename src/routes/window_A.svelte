<!-- Bom.svelte -->
<script lang="ts">
import Wallpaper from "#lib/Wallpaper.svelte";
import { getWindowManager } from "#lib/windowManager.svelte.ts";
const wManager = getWindowManager();

import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
let { win, winId, parentId }: WindowComponentProps = $props();

import MouseCords from "./MouseCords.svelte";

import Window_A_Titlebar from "./window_A_titlebar.svelte";

import Window_B from "./window_B.svelte";
import Window_C from "./window_C.svelte";
import { onMount } from "svelte";

const parent = $derived(wManager.find(winId));

let counter = $state(0);

onMount(() => {
  // console.log("wins ", win);
  // win;
});

function openWindow_B() {
  wManager.open(Window_B, {
    parentId: winId,
    title: "🪟 Window_B",
    width: 400,
    height: 300,
    props: { myOwnCustomProp: counter },
  });
}

function reparent() {
  wManager.reparent(win.winId, "root");
}
</script>

<MouseCords />
<Wallpaper word="Window A"></Wallpaper>

<h3>Current window :</h3>
<p> winParent: <strong>{parentId} </strong> </p>
  <!-- You can also use {win.parentId} -->
<p> winId:     <strong> {winId}</strong></p>

<!-- Current winTitle: {win.title} -->
<button onclick={reparent}>👁️ Switch parent to root</button> <br>
Reparent can also de done using shift + drag to drop window onto another window.
<br><br>
<strong> Counter: </strong>{counter}
<br><br>
<button onclick={openWindow_B}>Open Widow B</button>
