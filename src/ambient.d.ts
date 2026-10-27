declare module "*.svelte" {
  import type { Component } from "svelte";
  // Svelte 5 använder Component<Props, Exports, Bindings>
  const component: Component<any, any, any>;
  export default component;
}
