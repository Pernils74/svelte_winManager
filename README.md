# Svelte Window Manager

Live demo at : https://pernils74.github.io/svelte_winManager/

A lightweight, reactive multi-window manager for Svelte 5 applications.

Svelte Window Manager provides a desktop-like windowing system with movable and
resizable windows, nested window hierarchies, reactive state, payload-based
communication, and support for detaching windows into separate browser tabs or
Tauri windows.

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

The window manager lets Svelte components run inside movable and resizable
window frames.

### Features

- Multiple windows in a shared workspace.
- Nested windows and parent-child relationships.
- Reactive window geometry and frame state.
- Configurable titles, dimensions, transparency, and titlebars.
- Custom component props and window-specific payloads.
- Window duplication, reparenting, minimization, restoration, and maximization.
- Optional detachment into a separate browser tab or Tauri window.
- Backend-based messaging for communication with detached windows.
- Svelte 5 reactivity using runes such as `$state`, `$derived`, `$effect`, and
  `$props`.

## Architecture

The main implementation consists of the following files:

| File                      | Responsibility                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `windowManager.svelte.ts` | Manages window instances, reactive state, hierarchy, and window operations.                       |
| `WindowHost.svelte`       | Hosts the workspace, renders windows, and handles standalone-window initialization.               |
| `WindowFrame.svelte`      | Renders an individual window frame and handles dragging, resizing, focus, and frame interactions. |
| `windowRegistry.ts`       | Maps registered component keys to Svelte components for lookup.                                   |
| `windowBackend.ts`        | Defines communication with detached browser tabs and Tauri windows.                               |

Example components in `src/routes/` demonstrate how application components use
the manager:

- `window_A.svelte` demonstrates static props and getter-based live props.
- `window_B.svelte` receives props, maintains reactive state, and opens Window C
  with a payload.
- `window_C.svelte` reads and updates a typed payload.

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
```

This diagram illustrates a possible hierarchy. Whether Window C is actually
nested inside Window B depends on the `parentId` supplied when C is opened.

Detached windows follow a separate runtime path:

```text
WindowManager
    |
    +-- WindowBackend
           |
           +-- Browser tab
           |
           +-- Tauri window
```

The backend provides communication between the originating window and the
detached window's separate JavaScript context.

## Installation and Setup

Initialize the window manager in the appropriate Svelte context.

```svelte
<script lang="ts">
import { initializeWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = initializeWindowManager();
</script>
```

The manager uses Svelte context to share a `WindowManager` instance with
descendant components.

Inside a component that already belongs to this context, retrieve the existing
instance:

```ts
import { getWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = getWindowManager();
```

Call `initializeWindowManager()` from the intended provider or layout context.
Components within that context should normally use `getWindowManager()` rather
than creating independent managers.

The `WindowHost` component provides the workspace in which root-level windows
are rendered.

> Use the import paths configured by your SvelteKit project. The examples above
> use the `#lib` alias from this project.

## How Windows Work

Every managed window is represented by a `WindowInstance`.

A window instance contains its identity, component, properties, payload, parent
relationship, geometry, and frame state.

Conceptually, a window instance looks like this:

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

This is a conceptual overview, not necessarily the complete interface
definition. The actual implementation may contain additional fields for docking,
thumbnails, stored geometry, and DOM references.

The manager stores window instances in reactive state. Conceptually:

```ts
windows = $state<WindowInstance[]>([]);
```

This allows Svelte to update the workspace when windows are created, removed,
moved, resized, minimized, restored, or otherwise modified.

### Window identity

Each window has a unique `winId`. The manager normally generates an ID using
`crypto.randomUUID()`.

The special ID `"root"` represents the workspace root. It is not an ordinary
application window.

### Window geometry

The window's `state` contains geometry and frame-related properties.
Conceptually:

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

Geometry is interpreted relative to the relevant parent coordinate system. This
allows nested windows to be positioned within their parent window rather than
always relative to the workspace.

## Window Component Props

The manager provides infrastructure props to components rendered inside managed
windows.

Import the shared type:

```ts
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
```

### Core props

| Property   | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| `win`      | The current `WindowInstance`, including its state and payload. |
| `winId`    | The unique ID of the current window.                           |
| `parentId` | The parent window ID, or `null` if there is no parent ID.      |

For root-level windows, the parent ID is typically `"root"`.

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

Because `win` references the managed window instance, reactive changes to its
fields can be reflected in the component.

```svelte
<p>Current title: {win.title}</p>
<p>Current width: {win.state.width}</p>
```

These instance properties differ from ordinary initialization values, which may
be snapshots.

### Custom component props

Application components can combine `WindowComponentProps` with their own props.

```svelte
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

export interface WindowBProps {
  myNoneReactiveProp: string;
}

let {
  win,
  winId,
  parentId,
  myNoneReactiveProp,
}: WindowComponentProps & WindowBProps = $props();
</script>

<p>{myNoneReactiveProp}</p>
<p>Window ID: {winId}</p>
```

This separates the manager's infrastructure props from the component's
application-specific data contract.

## Opening Windows

Use `WindowManager.open()` to create a window.

```ts
const child = wManager.open(Window_C, {
  title: "Window C",
  parentId: winId,
  width: 400,
  height: 300,
  payload: {
    message: "Hello from the parent",
  },
});
```

The returned value is the created `WindowInstance`.

### `OpenWindowOptions`

The manager's options support configuration such as the following. Refer to the
actual `OpenWindowOptions` definition in `windowManager.svelte.ts` for the
authoritative types and defaults.

| Option         | Purpose                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `title`        | Window title.                                                                                                 |
| `parentId`     | Parent window ID. Use `"root"` or omit it for a root-level window, according to the implementation's default. |
| `boundingEl`   | Optional bounding element.                                                                                    |
| `tileOffset`   | Offset used when placing sibling windows.                                                                     |
| `setId`        | Requests a specific window ID; the implementation may return an existing matching window.                     |
| `props`        | Component initialization props.                                                                               |
| `payload`      | Data associated with the window instance.                                                                     |
| `left`         | Initial horizontal position.                                                                                  |
| `top`          | Initial vertical position.                                                                                    |
| `width`        | Initial width.                                                                                                |
| `height`       | Initial height.                                                                                               |
| `transparency` | Initial transparency setting.                                                                                 |
| `showButtons`  | Whether window buttons are shown.                                                                             |
| `docking`      | Initial docking configuration.                                                                                |
| `titlebar`     | Optional custom titlebar component.                                                                           |
| `componentKey` | Optional registered component key.                                                                            |

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

When a parent ID is supplied, the manager uses it to establish the hierarchy. If
the requested parent cannot be found, the implementation may fall back to the
root workspace.

## WindowManager API

The following methods describe the manager's main public operations. Check the
implementation in `windowManager.svelte.ts` for exact signatures and supported
arguments.

### Lookup and hierarchy

| Method                     | Purpose                              |
| -------------------------- | ------------------------------------ |
| `find(id)`                 | Finds a window by ID.                |
| `findByTitle(title)`       | Finds a window by title.             |
| `getChildren(parentId)`    | Returns direct children of a window. |
| `getDescendants(parentId)` | Returns descendants recursively.     |

Example:

```ts
const windowB = wManager.find(winId);
const children = wManager.getChildren(winId);
const descendants = wManager.getDescendants(winId);
```

### Creation and lifecycle

| Method                       | Purpose                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `open(component, options)`   | Creates a window and returns its instance.                                                |
| `duplicate(source, offset?)` | Creates a copy of a window.                                                               |
| `closeWin(win)`              | Closes a window and its descendants.                                                      |
| `detachWindow(win, target)`  | Opens a detached representation and removes the internal window after successful opening. |
| `closeDetached(id)`          | Requests closure of a detached window.                                                    |

`closeWin()` expects a `WindowInstance`, not merely a window ID.

### State and geometry

| Method                                    | Purpose                                                      |
| ----------------------------------------- | ------------------------------------------------------------ |
| `update(id, updates)`                     | Updates supported window state or geometry.                  |
| `updatePayload(id, payload)`              | Replaces the payload stored on a window instance.            |
| `updateAll(updates)`                      | Applies supported updates to ordinary managed windows.       |
| `setRootBounds(width, height)`            | Updates the root workspace dimensions.                       |
| `focus(win)`                              | Brings a window forward.                                     |
| `minimize(win)`                           | Minimizes a window and stores its geometry.                  |
| `restore(win)`                            | Restores a minimized window.                                 |
| `toggleMaximize(win, bounds)`             | Toggles maximization relative to bounds.                     |
| `resizeDockedWindow(win, mode, proposed)` | Resizes docked windows and adjusts adjacent siblings.        |
| `reparent(id, newParentId, screenRect?)`  | Changes a window's parent and adjusts its position and size. |
| `setThumbnail(id, thumbnail)`             | Sets a window thumbnail.                                     |

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

| Function                    | Purpose                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `initializeWindowManager()` | Retrieves the manager from context or creates and registers one if needed. |
| `getWindowManager()`        | Retrieves the existing manager from context.                               |

The manager also exposes its backend for communication with detached windows.

## Props, Payloads, and Reactivity

Understanding how values are passed between windows is important. **A payload is
not necessarily a snapshot:** its behaviour depends on whether it contains
primitive values, a shared reactive object, a getter, or data transferred
between separate JavaScript contexts.

Three common patterns are described below.

### 1. Static props: snapshots of primitive values

Consider a component opening another window:

```ts
wManager.open(Window_B, {
  title: "Window B (Snapshot)",
  props: {
    myNoneReactiveProp: message,
  },
});
```

If `message` is `"Hello"` when the options object is created, B receives that
string as its initial prop value.

If A later changes `message` to `"Goodbye"`, B does not automatically receive
the new string simply because the original value came from A. The primitive
value was evaluated when the object was created.

This pattern is appropriate for initial configuration, labels, defaults, and
values that do not need to remain connected to their source.

### 2. Getter-based props: reactive reads

A getter can expose a value from another component:

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
when accessed.

When the getter is evaluated during a Svelte reactive expression, Svelte may
track the dependency on the source state, provided both components run in the
same JavaScript and Svelte reactive context.

For example:

```svelte
<p>Message from A: {myNoneReactiveProp}</p>
```

Important considerations:

- A getter is not a separate state store.
- The receiving component must access the getter in a reactive context for
  dependency tracking to work as intended.
- A getter does not broadcast changes to another browser tab or Tauri webview.
- The `as any` cast bypasses static type checking; a dedicated reactive-props
  type would be preferable for a fully type-safe API.

Use getter-based props when a component needs to read a live value from another
component within the same reactive context.

### 3. Payloads: shared reactive state or independent data

A payload is data associated with a window instance. It is accessed through
`win.payload`.

The key distinction is whether you pass a primitive value, construct a new
object, or pass an existing reactive object by reference.

#### A. Passing a primitive value inside a new object

For example:

```svelte
<script lang="ts">
let counter = $state(0);

function openWindow_C() {
  wManager.open(Window_C, {
    title: "Window C",
    payload: {
      counter,
    },
  });
}
</script>
```

Here, `counter` is read when the payload object is created. The payload contains
the current numeric value; it is not automatically linked to the variable
`counter`.

Incrementing B's `counter` later will not, by itself, update the number already
stored in C's payload.

If you want to pass a changing primitive value, use a reactive getter-based
approach where supported, explicitly update the payload, or use the backend
messaging mechanism when the windows are in separate contexts.

#### B. Passing a `$state` object directly

Svelte 5 allows reactive state objects to be passed by reference within the same
JavaScript context.

In Window B:

```svelte
<script lang="ts">
import { getWindowManager } from "#lib/windowManager.svelte.ts";
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
import Window_C from "./window_C.svelte";

let { win, winId, parentId, myNoneReactiveProp }:
  & WindowComponentProps
  & { myNoneReactiveProp: string } = $props();

const wManager = getWindowManager();

let myData = $state({
  counter: 0,
});

function openWindow_C() {
  wManager.open(Window_C, {
    title: "Window C",
    width: 400,
    height: 500,
    payload: myData,
  });
}
</script>

<button onclick={() => myData.counter++}>
  Increment in B: {myData.counter}
</button>

<button onclick={openWindow_C}>
  Open Window C
</button>
```

Notice that `payload: myData` passes the reactive object itself. It does not
construct a new object containing only the current value of `counter`.

In Window C:

```svelte
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

interface WindowCPayload {
  counter: number;
}

let { win, winId, parentId }: WindowComponentProps<WindowCPayload> = $props();
</script>

<div>
  <p>Counter: {win.payload.counter}</p>

  <button onclick={() => win.payload.counter++}>
    Increment in C
  </button>
</div>
```

If the manager retains the same `$state` proxy reference in the payload, B and C
access the same reactive object.

As a result:

- Incrementing `myData.counter` in B updates the value displayed in C.
- Incrementing `win.payload.counter` in C updates the value displayed in B.
- You do not need to call `updatePayload()` for every mutation of that shared
  object.

The shared-reference relationship can be illustrated like this:

```text
Window B
    |
    | myData = $state({ counter: 0 })
    |
    +---- payload: myData ----+
                              |
                              v
                         Window C
                              |
                              | win.payload.counter++
                              |
                              v
                      Shared reactive state
                              |
                              +---- B updates
                              |
                              +---- C updates
```

**This behaviour depends on preserving object identity.** It applies when both
windows use the same manager and JavaScript context, and the manager stores the
original object without cloning, serializing, or replacing it.

Replacing the payload object, cloning it, or transferring it to another
JavaScript context changes these assumptions.

#### C. Replacing a payload explicitly

`updatePayload()` is useful when you want to replace the payload stored on a
managed window instance.

For example:

```ts
wManager.updatePayload(childWinId, {
  counter: myData.counter,
});
```

This replaces the payload object with a new object containing the current value.
It is different from mutating a shared `$state` object in place.

Use explicit updates when you need to replace the payload, when the payload is
constructed from primitive values, or when you intentionally want to send a new
data snapshot.

If an effect is used to propagate values, make sure it observes the intended
source state and handles the lifecycle of every child window. For multiple C
windows, track each child ID rather than updating only the most recently opened
one.

Also note that `updatePayload()` updates the instance in that `WindowManager`.
It does not itself broadcast changes to a separate browser tab or Tauri window.

#### D. Important limits of shared reactive state

A Svelte `$state` proxy is not a cross-window transport mechanism.

A separate browser tab or Tauri webview runs in a separate JavaScript context.
It cannot share the same in-memory reactive proxy with the originating window.

For detached windows, use the backend messaging mechanism described in
[Detached Windows and Backends](#detached-windows-and-backends).

In short:

| Data pattern                                          | Expected behaviour                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `props: { value }` where `value` is a primitive       | Initial value; later source changes are not automatically passed through.        |
| `props` with a getter                                 | Can provide reactive reads in the same reactive context.                         |
| `payload: { counter }` where `counter` is a primitive | Stores the current value in a newly created object.                              |
| `payload: myData` where `myData` is a `$state` object | Can share reactive state by reference within the same JavaScript context.        |
| Payload sent to a detached window                     | Requires a transfer mechanism; an in-memory proxy is not shared across contexts. |

## Examples: Windows A–C

The example files illustrate different ways of passing data between windows.

### Window A: props and reactivity

File: `src/routes/window_A.svelte`

A owns a reactive string:

```ts
let message = $state("Hello from A");
```

It demonstrates two ways to open B:

1. Pass the current string as a snapshot.
2. Pass a getter that reads the current string.

An input can update A's state:

```svelte
<input bind:value={message} />
```

The example shows why the way data is passed matters: passing a primitive copies
the current value, while a getter can preserve a reactive read connection within
the same context.

### Window B: receiving props and opening C

File: `src/routes/window_B.svelte`

B declares its application-specific prop:

```ts
export interface WindowBProps {
  myNoneReactiveProp: string;
}
```

It combines that interface with the shared window props:

```svelte
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

let {
  win,
  winId,
  parentId,
  myNoneReactiveProp,
}: WindowComponentProps & WindowBProps = $props();
</script>
```

B can also maintain its own reactive state:

```ts
let myData = $state({
  counter: 0,
});
```

To share that state with C in the same JavaScript context, pass the object
itself:

```ts
wManager.open(Window_C, {
  title: "Window C",
  payload: myData,
});
```

Do not confuse this with constructing a new object containing a primitive value:

```ts
payload: {
  counter: myData.counter,
}
```

The latter creates a separate object with the value read at that time.

In the current example, if the `parentId` option for C is commented out, C opens
at the root level rather than as a child of B. To make it a nested window, pass:

```ts
parentId: winId;
```

### Window C: reading a typed payload

File: `src/routes/window_C.svelte`

C declares the expected payload shape:

```ts
interface WindowCPayload {
  counter: number;
}
```

It then types the infrastructure props:

```svelte
<script lang="ts">
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";

let { win, winId, parentId }: WindowComponentProps<WindowCPayload> = $props();
</script>
```

C reads and updates the payload:

```svelte
<span>{win.payload.counter}</span>

<button onclick={() => win.payload.counter++}>
  Increment Counter
</button>
```

When the payload is the same `$state` object passed by B and the manager retains
the reference, the update is shared with B.

If the payload is instead a newly created object containing a primitive value, C
displays that stored value until the payload is updated or replaced.

## Window Hierarchy

Each managed window can belong to a parent window.

A root-level window is associated with the workspace root. A nested window uses
its parent's actual window ID.

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

The resulting hierarchy is:

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
enumerating descendants, closing descendants, and reparenting windows.

Reparenting can be performed with:

```ts
wManager.reparent(windowC.winId, windowB.winId);
```

The manager prevents a window from becoming its own parent or being moved inside
one of its descendants.

## Detached Windows and Backends

The manager can detach windows into separate browser tabs or Tauri windows.

**Detaching is an intentional lifecycle path.** A detached window needs to
initialize and render in its own browser or native-window context. This is why
the standalone path in `WindowHost.svelte` exists; it is not simply an
alternative rendering mode for an ordinary in-workspace window.

### Backend contract

The `windowBackend.ts` module defines the communication contract. Conceptually,
it includes operations similar to:

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

Refer to the source file for the authoritative interface and types.

### Browser backend

The browser backend can use:

- A separate browser tab for the detached window.
- URL parameters to identify the window and component.
- `localStorage` for initial payload transfer.
- `BroadcastChannel` for subsequent messages between browsing contexts.

### Tauri backend

The Tauri backend creates a separate webview window and uses Tauri events to
communicate between contexts.

### The standalone lifecycle

When a window is detached, the new context must initialize its own
representation of the window and render it independently.

The `standalone` path in `WindowHost.svelte` supports that initialization. It
allows a detached browser tab or Tauri window to host the intended component
rather than relying on the original workspace's in-memory component tree.

### Payload synchronization

A detached window runs in a separate JavaScript context. It does not share the
same in-memory `$state` proxy as the originating window.

The general data flow is:

1. The manager prepares a window descriptor and initial payload.
2. The backend opens the detached window.
3. The receiving context initializes its local window representation.
4. The originating context sends updates through the backend.
5. The receiving context handles incoming messages and updates its own local
   state.
6. Messages in the opposite direction can be used to communicate changes back,
   if implemented by the application and backend integration.

A payload transferred to a detached window is data transfer, not shared object
identity. Changes must be communicated through the backend.

Use shared `$state` objects for in-context reactivity. Use backend messaging for
communication between detached contexts.

## Troubleshooting

### Changes in B do not appear in C

Check how the payload was created.

This passes a primitive value into a new object:

```ts
payload: {
  counter: myData.counter,
}
```

The object contains the current value, not a reference to the original `$state`
object.

To share reactive state in the same JavaScript context, pass the reactive object
directly:

```ts
payload: myData;
```

Then verify that the manager preserves the original reference and does not clone
or replace it.

If the window is detached, use backend messaging instead.

### Changes in C do not appear in B

Check that both components access the same reactive object and that the payload
has not been replaced by a separate object.

For in-context shared state, both components should use the same payload
reference:

```ts
payload: myData;
```

and update its properties:

```ts
win.payload.counter++;
```

If you intentionally replace the payload using `updatePayload()`, ensure the new
payload is the object you want both components to use. A replacement object is
not automatically the same reference as the original state object.

### Getter-based props do not update

Ensure that:

- The prop is actually a getter.
- The getter reads the intended reactive source.
- The receiving component reads the value in a Svelte reactive context.
- Both components run in the same JavaScript context.

A getter does not automatically synchronize state between separate browser tabs
or Tauri webviews.

### A window opens at the workspace root instead of inside its parent

Set the `parentId` option to the intended parent's `winId`:

```ts
wManager.open(Window_C, {
  title: "Window C",
  parentId: winId,
});
```

If no valid parent is supplied, the window may be placed at the root level.

### A detached window does not reflect changes from its original window

A detached window has a separate JavaScript context. It cannot directly observe
the original context's in-memory reactive objects.

Verify that:

- The appropriate backend is configured.
- The detached window initializes through the standalone lifecycle.
- The sender transmits updates through the backend.
- The receiver subscribes to messages and applies them to its local state.

### A child window remains after its parent closes

Use the manager's supported close operation and verify that the parent-child
relationship is set correctly. The manager's close logic is designed to remove
descendant windows when a parent is closed.

---

## Design Guidelines

- Use **static props** for initialization values that do not need to stay
  connected to their source.
- Use **getter-based props** for reactive reads within the same JavaScript
  context, where supported.
- Use a **shared `$state` object as the payload** when multiple managed windows
  should mutate the same reactive data in the same context.
- Use **`updatePayload()`** when replacing a window's payload is the intended
  operation.
- Use **backend messaging** when data must cross into a detached browser tab or
  Tauri window.
- Set **`parentId` explicitly** when a window should be nested inside another
  window.
- Keep the window manager initialized in the appropriate context and retrieve
  the existing instance in descendant components.

For exact method signatures, types, defaults, and backend behaviour, the source
files remain the authoritative reference.
