# Svelte Window Manager

A lightweight, reactive multi-window manager for Svelte 5 applications.

This project provides a desktop-like windowing system with movable and resizable
windows, nested windows, reactive window state, payload-based communication, and
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
- [Detaching Windows](#detaching-windows)
- [Window Backends](#window-backends)
- [Payload Synchronization](#payload-synchronization)
- [Troubleshooting](#troubleshooting)

## Overview

The window manager allows Svelte components to run inside movable and resizable
window frames.

### Features

- Multiple windows inside a shared workspace.
- Nested windows and parent-child relationships.
- Reactive window geometry and frame state.
- Configurable window titles, dimensions, transparency, and titlebars.
- Component props for initialization and data access.
- Typed payloads associated with window instances.
- Window duplication and reparenting.
- Minimization, restoration, maximization, and focus management.
- Docking and coordinated resizing of adjacent windows.
- Detaching windows into separate browser tabs or Tauri windows.
- Backend communication between detached windows and the original application.
- Svelte 5 reactivity using `$state`, `$derived`, `$effect`, and `$props`.

The window manager separates window infrastructure from application-specific
state. This makes it possible to build components that work inside the main
workspace as well as in detached windows.

## Architecture

The main implementation consists of five core files.

| File                              | Responsibility                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/lib/windowManager.svelte.ts` | Owns window instances, reactive state, hierarchy, and window operations.                          |
| `src/lib/WindowHost.svelte`       | Hosts the workspace and initializes standalone windows when opened in another execution context.  |
| `src/lib/WindowFrame.svelte`      | Renders an individual window frame and handles dragging, resizing, focus, and frame interactions. |
| `src/lib/windowRegistry.ts`       | Maps registered component keys to Svelte components for lookup.                                   |
| `src/lib/windowBackend.ts`        | Defines communication with detached browser tabs and Tauri windows.                               |

The example components in `src/routes/` demonstrate how application components
interact with the manager.

| Example           | Purpose                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `window_A.svelte` | Demonstrates snapshot props and getter-based live props.                         |
| `window_B.svelte` | Receives props, manages local reactive state, and opens Window C with a payload. |
| `window_C.svelte` | Reads a typed payload from its window instance.                                  |

### How the pieces fit together

```text
Workspace
    |
    +-- WindowHost
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
                  |      |
                  |      +-- Window B
                  |             |
                  |             +-- Window C
                  |
                  +-- Other windows

Detaching a window
    |
    +-- WindowBackend
           |
           +-- Browser tab
           |      |
           |      +-- Standalone WindowHost
           |
           +-- Tauri window
                  |
                  +-- Standalone WindowHost
```

The diagram illustrates the logical architecture. Whether Window C is nested
inside B depends on the `parentId` supplied when C is opened.

**Standalone mode is an intentional part of the window lifecycle.** It allows a
window to continue running independently after being detached from the original
workspace.

## Installation and Setup

Initialize the manager in the appropriate Svelte context:

```svelte
<script lang="ts">
import { initializeWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = initializeWindowManager();
</script>
```

The manager uses Svelte context to share a `WindowManager` instance with
descendant components.

Inside a component that already belongs to the manager's context, retrieve the
existing instance:

```ts
import { getWindowManager } from "#lib/windowManager.svelte.ts";

const wManager = getWindowManager();
```

Call `initializeWindowManager()` from the intended provider or layout context.
Components rendered inside that context should use `getWindowManager()` rather
than creating independent managers.

The `WindowHost` component provides the workspace in which root-level windows
are rendered. It also handles initialization of a detached window when the
application is running in standalone mode.

A detached window runs in its own JavaScript context, so it cannot rely on the
original workspace's in-memory reactive objects.

## How Windows Work

Every window is represented by a `WindowInstance`.

A window instance contains its identity, component, props, payload, parent
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

The manager stores its window instances in reactive state:

```ts
windows = $state<WindowInstance[]>([]);
```

This allows Svelte to react to changes in the window collection and to reactive
properties of individual window instances.

### Window identity

Each window has a unique `winId`. By default, the manager generates an ID using
`crypto.randomUUID()`.

The special ID `"root"` represents the workspace root. It is not an ordinary
application window.

### Window geometry

A window's `state` contains geometry and frame information:

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
allows nested windows to be positioned relative to their parent rather than
always relative to the desktop.

In standalone mode, the detached window is hosted in its own browser tab or
Tauri window. Its frame and geometry are therefore handled in the context of
that detached window.

## Window Component Props

Application components receive infrastructure props from the window host.

Import the shared type:

```ts
import type { WindowComponentProps } from "#lib/windowManager.svelte.ts";
```

### Core props

| Property   | Type                       | Description                                                 |
| ---------- | -------------------------- | ----------------------------------------------------------- |
| `win`      | `WindowInstance<TPayload>` | The window instance associated with the component.          |
| `winId`    | `string`                   | The unique ID of the current window.                        |
| `parentId` | `string \| null`           | The parent window ID, or `null` when there is no parent ID. |

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
properties can be reflected in the component.

For example:

```svelte
<p>Current title: {win.title}</p>
<p>Current width: {win.state.width}</p>
```

This is different from reading an ordinary initialization prop that contains
only a snapshot of a value.

### Custom component props

Application components can combine the infrastructure props with their own
props.

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

This separates the manager's infrastructure contract from the application's own
data contract.

For detached windows, the host must also initialize the component with the
correct window instance and application data in the receiving context.

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

The returned value is the created `WindowInstance`.

### OpenWindowOptions

The following options are defined by the manager.

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

The following methods are implemented in `windowManager.svelte.ts`.

### Lookup and hierarchy

| Method                     | Description                          |
| -------------------------- | ------------------------------------ |
| `find(id)`                 | Finds a window by ID.                |
| `findByTitle(title)`       | Finds a window by title.             |
| `getChildren(parentId)`    | Returns direct children of a window. |
| `getDescendants(parentId)` | Returns all descendants recursively. |

Example:

```ts
const windowB = wManager.find(winId);

const children = wManager.getChildren(winId);

const descendants = wManager.getDescendants(winId);
```

### Creation and lifecycle

| Method                       | Description                                                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `open(component, options)`   | Creates a window and returns its instance.                                                                              |
| `duplicate(source, offset?)` | Creates a copy of a window.                                                                                             |
| `closeWin(win)`              | Removes a window and its descendants from the manager.                                                                  |
| `detachWindow(win, target)`  | Detaches a window to a separate execution context and removes its internal workspace instance after successful opening. |
| `closeDetached(id)`          | Requests closure of a detached window.                                                                                  |

`closeWin()` expects a `WindowInstance`, not just an ID. It also removes
descendant windows from the manager's window collection.

Detaching a window is different from closing it. Detaching transfers its
presentation and operation to a separate context, whereas closing removes the
window.

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

**Important:** `updatePayload()` updates the window instance owned by the
manager on which it is called. It does not automatically broadcast updates to a
detached browser tab or Tauri window.

### Manager initialization

| Function                    | Description                                                                |
| --------------------------- | -------------------------------------------------------------------------- |
| `initializeWindowManager()` | Retrieves the manager from context or creates and registers one if needed. |
| `getWindowManager()`        | Retrieves the existing manager from context.                               |

The manager also exposes `backend`, which provides communication with detached
windows.

## Props, Payloads, and Reactivity

Understanding the difference between props, payloads, and reactive state is
essential when communicating between windows.

Passing a value to a new window does not automatically establish a live
connection to the source state. The behavior depends on what is passed, how it
is accessed, and whether both components share the same JavaScript context.

There are three important patterns.

### 1. Static props: snapshots

In `window_A.svelte`, the snapshot example passes the current string:

```ts
wManager.open(Window_B, {
  title: "Window B (Snapshot)",
  props: {
    myNoneReactiveProp: message,
  },
});
```

If `message` is `"Hello"`, B receives that value when the object is created.

If A later changes `message` to `"Goodbye"`, B does not automatically receive
the new string. The original value was evaluated when the object was created.

This is useful for initialization, configuration, labels, and values that do not
need to remain connected to their source.

### 2. Getter-based props: live reads

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
- The `as any` cast bypasses the current static props type check; a dedicated
  reactive-props type would be preferable for a fully type-safe API.

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

The payload is a data object associated with the window. Passing the current
counter value does not, by itself, create a live link to B's state.

If B increments `counter`, the payload previously stored on C does not
automatically acquire the new primitive value.

#### Updating a payload within the same manager

To keep C synchronized with B while both are hosted by the same manager, B can
explicitly update C's payload.

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

The `$effect` observes the counter and updates C's payload whenever the counter
changes.

If B can open multiple C windows, keep track of each child ID and update each
relevant window rather than only the most recently opened one.

This example applies to windows managed by the same reactive `WindowManager`.
Detached windows require explicit backend communication.

### Understanding Svelte 5 reactivity

The project uses Svelte 5 runes to make state and dependencies explicit.

| Rune       | Purpose                                               |
| ---------- | ----------------------------------------------------- |
| `$state`   | Creates reactive state.                               |
| `$derived` | Computes a value from reactive dependencies.          |
| `$effect`  | Runs an effect when its reactive dependencies change. |
| `$props`   | Declares component props.                             |

Example:

```ts
let counter = $state(0);

let doubled = $derived(counter * 2);
```

When `counter` changes, `doubled` is recalculated.

For effects:

```ts
$effect(() => {
  console.log("Counter changed:", counter);
});
```

The effect tracks reactive values read inside it and reruns when those
dependencies change.

However, reactivity is not the same as communication. Svelte can track state
within a JavaScript context, but it cannot automatically share a reactive object
with a separate browser tab or Tauri webview.

## Examples: Windows A–C

The three example files demonstrate different aspects of the window manager.

### Window A: props and reactivity

File: `src/routes/window_A.svelte`

A owns a reactive string:

```ts
let message = $state("Hello from A");
```

It provides two ways to open B:

1. Pass the current string as a snapshot.
2. Pass a getter that reads the current string.

The input is bound to the local state:

```svelte
<input bind:value={message} />
```

This updates A's state as the user types.

The example demonstrates why the way data is passed matters: passing a primitive
value copies the current value, while a getter can preserve a reactive read
connection within the same context.

### Window B: receiving props and managing local state

File: `src/routes/window_B.svelte`

B declares its application-specific prop:

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

It does not automatically follow B's counter merely because the initial payload
was created from that counter.

## Window Hierarchy

Each window can belong to a parent window.

A root-level window uses:

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

This creates the following logical hierarchy:

```text
Root Workspace
    |
    +-- Window A
           |
           +-- Window B
                  |
                  +-- Window C
```

The manager uses the parent-child relationship for operations such as finding
children, enumerating descendants, and reparenting windows.

Reparenting is performed with:

```ts
wManager.reparent(windowC.winId, windowB.winId);
```

The manager prevents a window from becoming its own parent or being moved inside
one of its descendants.

Detaching a window changes where it is hosted. It does not inherently mean that
the window was originally a root-level window.

## Detaching Windows

A window can be detached from the workspace and opened in a separate browser tab
or Tauri window.

Detaching is useful when a user wants to move a window outside the main
application workspace while keeping its component and application functionality
available.

### Workspace mode vs. standalone mode

| Feature                 | Workspace mode                              | Standalone mode                                            |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Execution context       | Main application context                    | Separate browser or Tauri context                          |
| Rendering               | Inside the workspace and its window frame   | Hosted independently by `WindowHost`                       |
| Position and size       | Managed relative to the workspace or parent | Managed in the detached window's environment               |
| Window state            | Owned by the workspace's manager            | Initialized and maintained in the receiving context        |
| Component props         | Passed during component rendering           | Reconstructed or supplied during standalone initialization |
| Payload synchronization | Can use the shared reactive manager         | Requires explicit cross-context messaging for updates      |

Standalone mode is not a separate windowing system. It is the hosting mode used
when a window is detached from the original workspace.

The detached window continues to use the window component and its application
logic, but its runtime state belongs to a different JavaScript context.

### The detachment lifecycle

The logical lifecycle is:

1. The user requests that a window be detached.
2. The manager asks the selected backend to open a new browser tab or Tauri
   window.
3. The detached context starts the application and initializes `WindowHost` in
   standalone mode.
4. The standalone host resolves the window component and initializes its window
   instance.
5. The component renders with the appropriate window infrastructure props and
   initial data.
6. Subsequent changes that must be shared with the original application are
   communicated through the backend.

The exact details of initialization depend on the selected backend.

### Standalone initialization

When a detached window starts, `WindowHost` must identify the window and
component using the information supplied during detachment.

The standalone host must then:

- Resolve the component through the registration mechanism.
- Initialize the appropriate window instance.
- Restore the relevant initial props and payload.
- Pass the expected infrastructure props to the component.
- Set up any necessary backend message listeners.

The component should receive the same logical window contract in both rendering
modes. However, the window instance in standalone mode belongs to the receiving
context rather than being the same in-memory object as the original workspace
instance.

This distinction is important for both lifecycle management and reactivity.

## Window Backends

`windowBackend.ts` defines the communication contract used by the manager to
interact with detached windows.

Conceptually, the interface is:

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

The backend separates window lifecycle operations from the transport used to
communicate between execution contexts.

### Browser backend

The browser implementation uses:

- A separate browser tab for the detached window.
- URL parameters to identify the window and component.
- `localStorage` for initial payload transfer.
- `BroadcastChannel` for subsequent messages between browsing contexts.

The new tab initializes its own Svelte application context. It does not inherit
the original tab's in-memory state.

### Tauri backend

The Tauri implementation opens a separate native webview window and uses Tauri
events to communicate between contexts.

The detached webview has its own JavaScript context and reactive state.
Communication with the original window therefore requires messages rather than
direct references to reactive objects.

### Why a backend is necessary

A normal workspace window can use the same `WindowManager` instance as its
sibling windows.

A detached window cannot directly access the original window's JavaScript
objects. The backend provides the transport needed to transfer initial data and
send subsequent updates.

The backend does not automatically make application state reactive across
contexts. It provides the mechanism for applications or the manager to implement
synchronization.

## Payload Synchronization

A detached window runs in a separate JavaScript context. Its reactive state is
not the same object as the state in the originating window.

The communication flow is:

```text
Original Window
    |
    | update application data
    v
WindowManager
    |
    | backend.send(...)
    v
WindowBackend
    |
    | message
    v
Detached Window
    |
    | backend.onMessage(...)
    v
Local Window Instance
    |
    | update local reactive state
    v
Svelte UI updates
```

The backend's `send()` method transmits data, while `onMessage()` registers a
listener and returns an unsubscribe function.

### Initial payload vs. live updates

Initial payload transfer and subsequent updates are different operations.

**Initial payload**

The payload is transferred when the detached window is opened and initialized.

**Subsequent updates**

When the source window changes a value, the application or manager must send the
new value through the backend. The receiving context must handle the message and
update its local window instance.

A local call to `updatePayload()` does not automatically send a message to a
detached window. Code responsible for synchronizing detached windows must
explicitly send the new payload through the backend and ensure the receiver is
listening.

### Data transfer considerations

Only serializable data should be used for cross-context messages.

Avoid relying on transferring:

- Functions or closures.
- DOM elements.
- Live Svelte proxies.
- References to objects that exist only in the originating JavaScript context.

Instead, send plain data objects and update the receiving window's local
reactive state when a message arrives.

The browser and Tauri backends provide transport mechanisms; they do not
automatically share arbitrary application state.

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

For a live read within the same reactive context, consider a getter. For
explicit data transfer, use a payload and update it when the source state
changes.

### A payload does not update in Window C

Check that:

1. C reads `win.payload`.
2. B retains C's `winId`.
3. B calls `updatePayload()` when the counter changes.
4. B and C share the same manager if using local updates.
5. Detached windows use backend messages for cross-context synchronization.

### A detached window does not initialize correctly

Check the standalone initialization path in `WindowHost.svelte`.

Verify that:

1. The detached window receives a valid window ID and component identifier.
2. The component can be resolved in the receiving context through
   `windowRegistry.ts`.
3. The standalone host initializes the correct window instance.
4. The component receives the expected infrastructure props, including `win`,
   `winId`, and `parentId` where applicable.
5. The initial payload is transferred successfully.
6. Backend listeners are initialized when ongoing synchronization is required.

Remember that a detached window runs in a separate JavaScript context. It cannot
directly reuse the original workspace's in-memory reactive objects.

### A detached window does not receive subsequent payload updates

Check that the source explicitly sends updates through the backend and that the
receiving context has registered a listener.

For example, verify the logic surrounding:

```ts
await backend.send(winId, payload);
```

and:

```ts
const unsubscribe = backend.onMessage(
  winId,
  (payload) => {
    // Apply the incoming data to local reactive state.
  },
);
```

These snippets illustrate the communication contract; use the actual backend
instance and message format provided by the implementation.

Ensure that listeners are cleaned up when the receiving component or window is
destroyed.

### A detached window cannot resolve its component

Check that the component key is valid and that the receiving context can resolve
it through the component registration mechanism.

Components used across contexts must be registered and resolvable in the
receiving application.

### A window does not render the expected payload

Check that the correct payload is supplied during initialization and that the
component reads it from the expected window instance.

In standalone mode, the payload must be transferred or reconstructed in the
receiving context. Updating the original window's payload is not sufficient to
update the detached window.

## Summary

The window manager separates window infrastructure, application data, and
cross-context communication.

- `win` provides access to the current window instance.
- `winId` identifies a window.
- `parentId` describes the window hierarchy.
- `props` supplies component inputs, which may be snapshots or getter-based
  reads.
- `payload` stores application data associated with a window.
- `WindowManager` owns window creation, lookup, geometry, hierarchy, and
  lifecycle.
- `WindowHost` renders workspace windows and initializes standalone windows.
- `WindowFrame` provides the interactive window frame in the workspace.
- `windowRegistry.ts` resolves components by their registered keys.
- `WindowBackend` handles communication with detached browser or Tauri windows.

The most important distinction is between **reactivity within a single
JavaScript context** and **communication between separate contexts**.

Windows inside the same manager can share reactive window instances. Detached
windows run independently and require explicit message-based synchronization for
live updates.

Understanding this distinction is essential for building reliable communication
between windows.
