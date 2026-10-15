import { crossfade } from "svelte/transition";
import { cubicInOut } from "svelte/easing";

export const [send, receive] = crossfade({
  duration: 280,
  easing: cubicInOut,

  fallback(node, params) {
    const style = getComputedStyle(node);
    const opacity = Number(style.opacity) || 1;

    return {
      duration: 180,
      easing: cubicInOut,
      css: (t) => `
        opacity: ${t * opacity};
        transform: scale(${0.88 + 0.12 * t});
        border-radius: ${12 * (1 - t)}px;
      `,
    };
  },
});
