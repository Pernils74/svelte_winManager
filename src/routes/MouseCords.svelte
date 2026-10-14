<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";

let mouseX = $state(0);
let mouseY = $state(0);
let showPopup = $state(true);

let hoveredClass = $state("");
let position = $state("");
let elType = $state("");

let hoverId = $state("");
let rect: DOMRect | null = $state(null);
let boundRect: DOMRect | null = $state(null);
let contRect: DOMRect | null = $state(null);
let boxRect: DOMRect | null = $state(null);

let overBox = $state<HTMLElement | null>(null);
let overContent = $state<HTMLElement | null>(null);
let overBounding = $state<HTMLElement | null>(null);

let winid = $state("");

const wManager = getWindowManager();

function onMouseOver(event: MouseEvent) {
  const target = event.target as HTMLElement;

  // Basinfo om exakt det element man hovrar
  elType = target.tagName;
  hoveredClass = target.className.toString();
  position = window.getComputedStyle(target).position;
  hoverId = target.id ?? "";
  rect = target.getBoundingClientRect();

  // Leta upp närmaste box/content/bounding
  const box = target.closest(".draggable-box") as HTMLElement | null;
  const content = target.closest(".draggable-content") as HTMLElement | null;
  const bounding = target.closest(".boundingEl") as HTMLElement | null;

  // Ta bort gamla highlights
  document.querySelectorAll(".draggable-box, .draggable-content, .boundingEl")
    .forEach((el) => el.classList.remove("highlight"));

  overBox = box;
  overContent = content;
  overBounding = bounding;

  if (box) {
    box.classList.add("highlight");

    const winidAttr = box.getAttribute("data-winid");
    if (winidAttr) {
      winid = winidAttr;
      const win = wManager.find(winid);
      if (win) {
        boundRect = win.boundingEl?.getBoundingClientRect() ?? null;
        contRect = win.contentEl?.getBoundingClientRect() ?? null;
        boxRect = win.boxEl?.getBoundingClientRect() ?? null;
      }
    }
  }

  if (content) content.classList.add("highlight");
  if (bounding) bounding.classList.add("highlight");
}
</script>

<!-- ✅ Track mouse coordinates -->
<svelte:window
  on:mousemove={(e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }}
  on:mouseover={onMouseOver}
/>

{#if showPopup}
  <div
  style="
      position: fixed;
      top: {mouseY + 10}px;
      left: {mouseX + 10}px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      pointer-events: none;
      z-index: 1000;
      max-width: 280px;
    "
>
    <div style="font-weight:bold; margin-bottom:0.25rem;">🪄 Mouse Tracker</div>
    <p><b>Mouse:</b> {mouseX} × {mouseY}</p>
    <p><b>Hovered type:</b> {elType}</p>
    <p><b>Class:</b> {hoveredClass}</p>
    <p><b>Position:</b> {position}</p>

    {#if winid}
      <p><b>winId:</b> {winid}</p>
    {/if}

    {#if hoverId}
      <p><b>hoverId:</b> {hoverId}</p>
    {/if}

    {#if rect}
      <p><b>Hovered rect:</b></p>
      <ul style="margin:0; padding-left:1rem;">
        <li>top: {Math.round(rect.top)}</li>
        <li>left: {Math.round(rect.left)}</li>
        <li>w: {Math.round(rect.width)}</li>
        <li>h: {Math.round(rect.height)}</li>
        <li>bottom: {Math.round(rect.bottom)}</li>
      </ul>
    {/if}

    {#if overBox}
      <p style="color:#0066cc;"><b>Inside draggable-box</b></p>
    {/if}
    {#if overContent}
      <p style="color:#009933;"><b>Inside draggable-content</b></p>
    {/if}
    {#if overBounding}
      <p style="color:#cc0000;"><b>Inside boundingEl</b></p>
    {/if}
  </div>
{/if}

<style>
.highlight {
  outline: 2px solid red;
  outline-offset: -2px;
}
</style>
