# Svelte Window Manager

A lightweight, reactive multi-window manager for Svelte 5 applications.

The project provides a desktop-like windowing system with nested windows, window
positioning and resizing, reactive state, payload-based data transfer, and
support for detaching windows into separate browser tabs or Tauri windows.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation and Setup](#installation-and-setup)
- [How Windows Work](#how-windows-work)
- [Window Component Props](#window-component-props)
- [Opening Windows](#opening-windows)
- [WindowManager API](#windowmanager-api)
- [Props, Payloads, and Reactivity](#props-payloads-and-reactivity)
- [Examples: Windows A–C](#examples-windows-ac)
- [Window Hierarchy](#window-hierarchy)
- [Detached Windows and Backends](#detached-windows-and-backends)
- [Troubleshooting](#troubleshooting)

## Overview

The window manager allows Svelte components to run inside movable and resizable
window frames.

Its main features include:

- Multiple windows within a shared workspace.
- Nested windows and parent-child relationships.
- Reactive window geometry and frame state.
- Configurable window titles, dimensions, transparency, and titlebars.
- Component props for initialization and communication.
- Typed payloads for transferring data between windows.
- Window duplication, reparenting, minimization, restoration, and maximization.
- Optional detachment into a browser tab or Tauri window.
- Cross-context payload messaging through a backend abstraction.

The project uses Svelte 5 runes, including `$state`, `$derived`, `$effect`, and
`$props`, to manage reactive state.

## Architecture

The main implementation consists of five core files.

| File                      | Responsibility                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `windowManager.svelte.ts` | Owns window instances, reactive state, hierarchy, and window operations.                          |
| `WindowHost.svelte`       | Hosts the workspace, renders root windows, and handles standalone-window initialization.          |
| `WindowFrame.svelte`      | Renders an individual window frame and handles dragging, resizing, focus, and frame interactions. |
| `windowRegistry.ts`       | Maps registered component keys to Svelte components for lookup.                                   |
| `windowBackend.ts`        | Handles communication with detached browser tabs and Tauri windows.                               |

The example components in `src/routes/` demonstrate how application components
interact with the manager.

- `window_A.svelte` demonstrates static props and getter-based live props.
- `window_B.svelte` receives props, manages local state, and opens Window C with
  a payload.
- `window_C.svelte` reads a typed payload from its window instance.

### How the pieces fit together

```text
WindowHost
    |
    +-- WindowManager
    |      |
    |      +-- Reactive window instances
    |      +-- Window hierarchy
    |      +-- Props and payloads
    |      +-- Window operations
    |
    +-- WindowFrame
           |
           +-- Window A
                  |
                  +-- Window B
                         |
                         +-- Window C

Detached windows:
WindowManager
    |
    +-- WindowBackend
           |
           +-- Browser tabs
           +-- Tauri windows
```

The diagram illustrates the logical architecture. Whether Window C is actually
nested inside B depends on the `parentId` supplied when it is opened.

## Installation and Setup

Initialize the manager in the appropriate Svelte context:

```svelte
<script lang="ts">
import { initializeWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = initializeWindowManager();
</script>
```

The manager uses Svelte context to share a single `WindowManager` instance with
descendant components.

Inside an existing window component, retrieve the shared instance with:

```ts
import { getWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = getWindowManager();
```

Call `initializeWindowManager()` from the intended provider or layout context.
Components rendered inside that context should use `getWindowManager()` rather
than creating independent managers.

The `WindowHost` component provides the workspace in which root windows are
rendered.

## How Windows Work

Every window is represented by a `WindowInstance`.

A window instance contains its identity, component, properties, payload, parent
relationship, geometry, and frame state.

Conceptually:

```ts
interface WindowInstance<TPayload = unknown> {
  winId: string;
  title: string;
  component: Component<any> | null;
  componentKey?: string;
  props: Record<string, unknown>;
  parentId: string | null;
  state: WindowState;
  payload: TPayload;
}
```

The actual interface contains additional fields, including docking information,
thumbnails, stored geometry, and DOM references.

The manager stores window instances in a reactive array:

```ts
windows = $state<WindowInstance[]>([]);
```

This lets Svelte update the workspace when windows are added, removed, moved,
resized, minimized, or otherwise modified.

### Window identity

Each window has a unique `winId`. By default, the manager generates an ID using
`crypto.randomUUID()`.

The special ID `"root"` represents the workspace root, not an ordinary
application window.

### Window geometry

The window's `state` contains:

```ts
interface WindowState {
  left: number;
  top: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  transparency: number;
}
```

Geometry is expressed relative to the window's parent coordinate system. This
allows nested windows to be positioned within their parent window rather than
always relative to the desktop.

## Window Component Props

The manager passes core infrastructure properties to application components
rendered inside normal window frames.

Import the shared type:

```ts
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
```

### Core props

| Property   | Type                       | Description                                                        |
| ---------- | -------------------------- | ------------------------------------------------------------------ |
| `win`      | `WindowInstance<TPayload>` | The full reactive window instance.                                 |
| `winId`    | `string`                   | The unique ID of the current window.                               |
| `parentId` | `string \| null`           | The ID of the parent window, or `null` when there is no parent ID. |

The root workspace uses `"root"` as the parent ID for root-level windows.
Therefore, a component's `parentId` is typically `"root"` or another window ID.

### Accessing window information

```svelte
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

let { win, winId, parentId }: WindowComponentProps = $props();
</script>

<p>Window ID: {winId}</p>
<p>Title: {win.title}</p>
<p>Parent: {parentId ?? "none"}</p>
<p>Width: {win.state.width}px</p>
```

Because `win` references the reactive window instance, changes to its reactive
fields can be reflected in the component.

For example:

```svelte
<p>Current title: {win.title}</p>
<p>Current width: {win.state.width}</p>
```

These values are different from ordinary initialization props, which may simply
be snapshots.

### Custom component props

Application components can combine `WindowComponentProps` with their own
interface.

```ts
interface WindowBProps {
  myNoneReactiveProp: string;
}

let {
  win,
  winId,
  parentId,
  myNoneReactiveProp,
}: WindowComponentProps & WindowBProps = $props();
```

This keeps the manager's infrastructure properties separate from the
application's own data contract.

## Opening Windows

Use `WindowManager.open()` to create a window.

```ts
const child = wManager.open(Window_C, {
  title: "Window C",
  parentId: winId,
  width: 400,
  height: 300,
  payload: {
    bCounter: counter,
  },
});
```

The returned object is the newly created `WindowInstance`.

### OpenWindowOptions

The following options are defined in `windowManager.svelte.ts`.

| Option         | Type                       | Purpose                                                                |
| -------------- | -------------------------- | ---------------------------------------------------------------------- |
| `title`        | `string`                   | Window title.                                                          |
| `parentId`     | `WindowId \| null`         | Parent window; defaults to the root workspace.                         |
| `boundingEl`   | `HTMLElement \| null`      | Optional bounding element.                                             |
| `tileOffset`   | `number`                   | Offset used when placing sibling windows.                              |
| `setId`        | `WindowId`                 | Request a specific window ID; an existing matching window is returned. |
| `props`        | `Record<string, unknown>`  | Component initialization props.                                        |
| `payload`      | `TPayload`                 | Data associated with the window instance.                              |
| `left`         | `number`                   | Initial horizontal position.                                           |
| `top`          | `number`                   | Initial vertical position.                                             |
| `width`        | `number`                   | Initial width.                                                         |
| `height`       | `number`                   | Initial height.                                                        |
| `transparency` | `number`                   | Initial transparency setting.                                          |
| `showButtons`  | `boolean`                  | Whether window buttons should be shown.                                |
| `docking`      | `WindowDocking`            | Initial docking relationships.                                         |
| `titlebar`     | `WindowTiltlebarComponent` | Optional custom titlebar component.                                    |
| `componentKey` | `string`                   | Optional component key.                                                |

Example:

```ts
wManager.open(Window_C, {
  title: "Child Window",
  parentId: winId,
  width: 500,
  height: 350,
  left: 40,
  top: 40,
  showButtons: true,
  payload: {
    message: "Hello from the parent",
  },
});
```

When a parent ID is supplied, the manager uses it to establish the window
hierarchy. If the requested parent cannot be found, the implementation falls
back to the root workspace.

## WindowManager API

The following public methods are implemented in `windowManager.svelte.ts`.

### Lookup and hierarchy

| Method                     | Description                          |
| -------------------------- | ------------------------------------ |
| `find(id)`                 | Finds a window by ID.                |
| `findByTitle(title)`       | Finds a window by title.             |
| `getChildren(parentId)`    | Returns direct children of a window. |
| `getDescendants(parentId)` | Returns all descendants recursively. |

```ts
const windowB = wManager.find(winId);

const children = wManager.getChildren(winId);

const descendants = wManager.getDescendants(winId);
```

### Creation and lifecycle

| Method                       | Description                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `open(component, options)`   | Creates a window and returns its instance.                                                |
| `duplicate(source, offset?)` | Creates a copy of a window.                                                               |
| `closeWin(win)`              | Removes a window and its descendants from the manager.                                    |
| `detachWindow(win, target)`  | Opens a detached representation and removes the internal window after successful opening. |
| `closeDetached(id)`          | Requests closure of a detached window.                                                    |

`closeWin()` expects a `WindowInstance`, not just an ID. It also removes
descendant windows from the internal window array.

### State and geometry

| Method                                    | Description                                                  |
| ----------------------------------------- | ------------------------------------------------------------ |
| `update(id, updates)`                     | Updates window geometry or frame state.                      |
| `updatePayload(id, payload)`              | Replaces the payload on a window instance.                   |
| `updateAll(updates)`                      | Applies state updates to all ordinary windows.               |
| `setRootBounds(width, height)`            | Updates the root workspace dimensions.                       |
| `focus(win)`                              | Brings a window forward by increasing its z-index.           |
| `minimize(win)`                           | Minimizes a window and stores its geometry.                  |
| `restore(win)`                            | Restores a minimized window.                                 |
| `toggleMaximize(win, bounds)`             | Toggles maximization relative to a bounding element.         |
| `resizeDockedWindow(win, mode, proposed)` | Resizes a window and adjusts adjacent docked siblings.       |
| `reparent(id, newParentId, screenRect?)`  | Changes a window's parent and adjusts its position and size. |
| `setThumbnail(id, thumbnail)`             | Updates a window's thumbnail.                                |

Example:

```ts
wManager.update(winId, {
  width: 600,
  height: 400,
});

wManager.updatePayload(winId, {
  message: "Updated",
});

wManager.focus(win);

wManager.reparent(winId, "root");

wManager.closeWin(win);
```

### Manager initialization

| Function                    | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| `initializeWindowManager()` | Retrieves the manager from context or creates and registers one if needed. |
| `getWindowManager()`        | Retrieves the existing manager from context.                               |

The manager also exposes `backend`, which provides communication with detached
windows.

## Props, Payloads, and Reactivity

This is one of the most important concepts in the project.

**Passing a value to a new window does not automatically establish a live
connection to the source state.** The result depends on what is passed and how
the receiving component accesses it.

There are three important patterns.

### 1. Static props: snapshot

In `window_A.svelte`, the snapshot example passes the current string:

```ts
wManager.open(Window_B, {
  title: "Window B (Snapshot)",
  props: {
    myNoneReactiveProp: message,
  },
});
```

If `message` is `"Hello"`, B receives that value when it is created.

If A later changes `message` to `"Goodbye"`, B does not automatically receive
the new string. The value was evaluated when the object was created.

This is useful for initial configuration, labels, defaults, and other values
that do not need to remain connected to the source.

### 2. Getter-based props: live reads within the same reactive context

The second example in A passes a getter:

```ts
wManager.open(Window_B, {
  title: "Window B (Live Link)",
  props: {
    get myNoneReactiveProp() {
      return message;
    },
  } as any,
});
```

Instead of storing the current string directly, the property reads `message`
whenever it is accessed.

If B reads this getter inside a Svelte reactive expression, Svelte can track the
dependency on A's state.

For example:

```svelte
<p>Message from A: {myNoneReactiveProp}</p>
```

When the getter is evaluated during reactive rendering, changes to `message` can
cause the displayed value to update.

This pattern is appropriate when A and B run in the same JavaScript and Svelte
reactive context.

Important considerations:

- A getter is not a separate state store.
- It does not broadcast changes to another browser tab or Tauri webview.
- The receiving component must read the getter in a reactive context for
  dependency tracking to work as intended.
- The `as any` cast in the example bypasses the current static props type check;
  a dedicated reactive-props type would be preferable for a fully type-safe API.

### 3. Payloads: data associated with a window

Payloads provide a separate place to store application data on a window
instance.

B opens C with:

```ts
let counter = $state(0);

function openWindow_C() {
  wManager.open(Window_C, {
    title: "Window C",
    payload: {
      bCounter: counter,
    },
  });
}
```

C declares its expected payload shape:

```ts
interface WindowCPayload {
  bCounter: number;
}
```

Then C reads the payload through the window instance:

```svelte
<span>{win.payload?.bCounter ?? 0}</span>
```

This is type-safe at the component level when the payload generic is declared
correctly.

However, the initial payload is still a snapshot. When B increments `counter`,
the payload object already stored on C does not automatically change.

To update C inside the same manager, replace its payload explicitly.

For example, in B:

```svelte
<script lang="ts">
let counter = $state(0);
let childWinId = $state<string | null>(null);

function openWindow_C() {
  const child = wManager.open(Window_C, {
    title: "Window C",
    parentId: winId,
    payload: {
      bCounter: counter,
    },
  });

  childWinId = child.winId;
}

$effect(() => {
  const currentCounter = counter;
  const currentChildId = childWinId;

  if (!currentChildId) return;

  wManager.updatePayload(currentChildId, {
    bCounter: currentCounter,
  });
});
</script>
```

The `$effect` observes the counter and updates the child payload when the value
changes.

This example illustrates the mechanism; if B can open multiple C windows, store
and update each child ID rather than only the most recently opened one.

**Important:** `updatePayload()` updates the instance held by that
`WindowManager`. It does not itself broadcast changes to a separate browser tab
or Tauri window. Detached windows need the backend messaging mechanism described
below.

## Examples: Windows A–C

The three example files demonstrate different aspects of the system.

### Window A: props and reactivity

File: `src/routes/window_A.svelte`

A owns a reactive string:

```ts
let message = $state("Hello from A");
```

It offers two ways to open B:

1. Pass the current string as a snapshot.
2. Pass a getter that reads the current string.

The input is bound to the local state:

```svelte
<input bind:value={message} />
```

This updates A's state as the user types.

The example illustrates why the way data is passed matters: passing a primitive
value copies the current value, while a getter can preserve a reactive read
connection within the same context.

### Window B: receiving props and managing local state

File: `src/routes/window_B.svelte`

B declares the expected application-specific prop:

```ts
export interface WindowBProps {
  myNoneReactiveProp: string;
}
```

It combines that interface with the core window props:

```ts
let {
  win,
  winId,
  parentId,
  myNoneReactiveProp,
}: WindowComponentProps & WindowBProps = $props();
```

B also owns its own reactive counter:

```ts
let counter = $state(0);
```

Incrementing it changes B's local state:

```svelte
<button onclick={() => counter++}>
  Increment Counter
</button>
```

Opening C transfers the current counter value in a payload.

In the current example, the `parentId` option for C is commented out. As a
result, C opens at the root level rather than as a child of B. To make it a
nested window, pass `parentId: winId`.

### Window C: reading a typed payload

File: `src/routes/window_C.svelte`

C defines the expected payload:

```ts
interface WindowCPayload {
  bCounter: number;
}
```

It then types the core props:

```ts
let {
  win,
  winId,
  parentId,
}: WindowComponentProps<WindowCPayload> = $props();
```

Finally, it reads the current value:

```svelte
<span class="badge">
  {win.payload?.bCounter ?? 0}
</span>
```

The displayed value is reactive when the underlying `win.payload` property is
updated through the same reactive manager instance.

It will not automatically follow B's counter merely because the original payload
was created from that counter.

## Window Hierarchy

Each window can belong to a parent window.

A root window uses:

```ts
parentId: "root";
```

A nested window uses the actual parent window ID:

```ts
parentId: winId;
```

For example:

```ts
const windowB = wManager.open(Window_B, {
  title: "Window B",
  parentId: winId,
});

const windowC = wManager.open(Window_C, {
  title: "Window C",
  parentId: windowB.winId,
});
```

This creates the hierarchy:

```text
Root Workspace
    |
    +-- Window A
           |
           +-- Window B
                  |
                  +-- Window C
```

The manager uses this relationship for operations such as finding children,
enumerating descendants, and reparenting windows.

Reparenting is performed with:

```ts
wManager.reparent(windowC.winId, windowB.winId);
```

The manager prevents a window from becoming its own parent or being moved inside
one of its descendants.

## Detached Windows and Backends

The manager can detach windows into separate browser tabs or Tauri windows.

The `windowBackend.ts` module defines the communication contract:

```ts
export interface WindowBackend {
  readonly target: "tab" | "tauri";

  open(window: ExternalWindowDescriptor): Promise<void>;
  close(winId: string): Promise<void>;
  send(winId: string, payload: unknown): Promise<void>;

  onMessage(
    winId: string,
    callback: (payload: unknown) => void,
  ): () => void;

  destroy(): void;
}
```

### Browser backend

The browser implementation uses:

- A new browser tab for the detached window.
- URL parameters to identify the window and component.
- `localStorage` for initial payload transfer.
- `BroadcastChannel` for subsequent messages between browsing contexts.

### Tauri backend

The Tauri implementation creates a separate webview window and uses Tauri events
to send payload updates.

### Payload synchronization

A detached window runs in a separate JavaScript context. Its reactive state is
not the same object as the state in the originating window.

The intended data flow is:

1. The manager creates a window with an initial payload.
2. The backend opens the detached window.
3. The receiving context initializes its local window representation.
4. Later updates are sent through the backend.
5. The receiver assigns the incoming payload to its local window instance.

The backend's `send()` method transmits data, while `onMessage()` registers a
listener and returns an unsubscribe function.

A local `updatePayload()` call alone does not send a message to the detached
window. Code responsible for updating detached windows must explicitly send the
new payload through the backend and ensure the receiving context is listening.

When detaching components, remember that the receiver needs a way to resolve the
component key. Components used across contexts should be registered and
resolvable in the receiving application.

Only serializable data should be sent through browser messaging or Tauri events.
Functions, DOM elements, and live Svelte proxies are not suitable as
cross-context payloads.

## Troubleshooting

### A child window does not appear inside its parent

Check that the correct parent ID is supplied:

```ts
parentId: winId;
```

Passing no parent ID causes the manager to use the root workspace.

### A prop does not update when the source changes

Check whether the value was passed as a snapshot:

```ts
props: {
  message,
}
```

If the source changes later, this object does not automatically acquire the new
primitive value.

For an in-context live read, consider a getter. For explicit data transfer, use
a payload and update it when the source state changes.

### A payload does not update in Window C

Check that:

1. C reads `win.payload`.
2. B retains C's `winId`.
3. B calls `updatePayload()` when the counter changes.
4. B and C share the same manager if using local updates.
5. Detached windows use `backend.send()` and `backend.onMessage()` for
   cross-context synchronization.

### A detached window cannot resolve its component

Check that the component key is valid and that the receiving context can resolve
it through the component registration mechanism.

Also verify that the component receives the expected props and that its payload
is read from the correct window instance.

### A window does not render the expected payload

The internal `WindowHost` path passes `win`, `winId`, `parentId`, and the
configured component props to the component.

The standalone path must likewise pass the actual window instance and the
expected infrastructure props. Ensure the component receives the same contract
in both rendering modes.

## Summary

The window manager separates window infrastructure from application data:

- **`win`** provides access to the current reactive window instance.
- **`winId`** identifies a window.
- **`parentId`** describes the window hierarchy.
- **`props`** supplies component inputs, which may be snapshots or getter-based
  reads.
- **`payload`** stores application data associated with a window.
- **`WindowManager`** owns window creation, lookup, geometry, hierarchy, and
  lifecycle.
- **`WindowBackend`** handles communication with detached browser or Tauri
  windows.

Understanding the difference between local reactive state, snapshot props,
getter-based props, and explicitly synchronized payloads is essential for
building reliable communication between windows.
