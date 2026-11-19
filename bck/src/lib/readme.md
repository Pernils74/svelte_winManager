# svelte_winManager - Distributed Window Architecture

## Goal

The primary goal of `svelte_winManager` is that application code should feel as close as possible to normal Svelte development.

A component should not need to know whether it is running:

- In the main application window
- In a detached browser popup
- In a separate Tauri window
- In a future runtime/backend

The following code should work identically regardless of where the component is rendered:

```ts
win.payload.counter++;
win.payload.selection = row;
```

The developer should not have to think about:

- BroadcastChannel
- postMessage
- RPC
- Tauri events
- Serialization
- Window location

Those concerns belong to the framework.

---

# Core Principles

## 1. Svelte-like Programming Model

A user of the framework should be able to think in terms of:

```ts
payload
props
callbacks
```

just as they would in a normal Svelte application.

When a component is moved to another runtime, the framework is responsible for maintaining the illusion that everything still behaves like a normal Svelte component tree.

---

## 2. Distributed Runtime

Each detached browser window (or Tauri window) owns its own runtime:

```text
Main Window
└─ Runtime A

Detached Window
└─ Runtime B

Detached Window
└─ Runtime C
```

Each runtime has:

```ts
WindowManager
WindowRegistry
WindowSync
WindowRpc
```

---

# Window Registry

## Purpose

Each runtime maintains a replicated topology of all windows in the application.

The registry is global metadata.

The actual `WindowInstance` objects remain local to each runtime.

---

## Registry Entry

```ts
interface WindowRegistryEntry {
    winId: WindowId;
    renderTargetWinId?: WindowId;

    componentKey: string;

    hostId: string;

    isDetached: boolean;
}
```

---

## Synchronization

Whenever a window is:

- Opened
- Closed
- Detached
- Attached
- Reparented

an event is broadcast to all runtimes.

Example:

```ts
{
    type: "window-opened",
    entry
}
```

```ts
{
    type: "window-closed",
    winId
}
```

All WindowManagers update their local registry.

---

## Why?

Without a shared registry:

```ts
manager.find(renderTargetWinId);
```

fails whenever the parent exists in another runtime.

The registry provides a global view of the window tree even when windows live in different JavaScript runtimes.

---

# Window Synchronization

## Component Responsibility

Window synchronization should not be handled by `WindowManager`.

Instead, each rendered window/frame determines whether synchronization is needed.

Current thought:

```ts
function needsSync(win: WindowInstance): boolean
```

returns true when:

```text
- Window is detached
OR
- Parent is detached
```

---

## Example

```text
ROOT
└─ A
   └─ B
```

No synchronization required.

---

If A becomes detached:

```text
Detached Host
└─ A
   └─ B
```

Then both A and B synchronize.

---

If only B becomes detached:

```text
ROOT
└─ A

Detached Host
└─ B
```

Only B synchronizes.

---

# ComponentRenderer (formerly WindowFrame)

Long-term the render component should likely become the synchronization owner.

Possible future naming:

```text
WindowFrame
↓
ComponentRenderer
```

Responsibilities:

```text
Render component
Observe payload changes
Determine if sync is required
Send updates via WindowSync
```

---

# Data Categories

The framework should support different categories of data.

---

## 1. Payload

### Purpose

Standard reactive state.

Closest equivalent to normal Svelte state.

```ts
win.payload.counter++;
```

```ts
win.payload.selectedRow = row;
```

Implemented using:

```ts
$state()
```

and synchronized automatically when required.

---

## Example

```ts
win.payload = $state({
    selection: null,
    zoomLevel: 1
});
```

---

# 2. Custom Props

## Purpose

Allow manual update control.

Useful for:

- Plotly
- Charts
- Large tables
- Expensive renders

Instead of automatic reactivity:

```ts
win.payload.data = data;
```

a component can receive updates explicitly:

```ts
manager.updateProps({
    data
}, win);
```

Props are published to other runtimes by default. When applying props received
from synchronization, pass `{ publish: false }` to avoid publishing them again:

```ts
manager.updateProps({ data }, win, {
    publish: false,
    preserveReferences: true
});
```

---

## Benefits

Developer controls:

- Frequency
- Throttling
- Debouncing
- Latest-wins strategies

Example:

```ts
$effect(() => {
    if (!readyForUpdate()) return;

    manager.updateProps(plotWin, {
        result
    });
});
```

This prevents expensive components from re-rendering excessively.

---

# 3. Binary Data

## Purpose

Efficient transfer of large datasets.

Examples:

```ts
Float32Array
Float64Array
Uint8Array
ArrayBuffer
ImageData
MeshData
RaytraceResults
```

---

## Ownership Transfer

Instead of cloning large data structures repeatedly:

```text
Copy
Copy
Copy
Copy
```

use transferable buffers:

```ts
postMessage(
   buffer,
   [buffer]
);
```

Ownership moves to the receiver.

No memory duplication.

---

## Proposed API

```ts
manager.updateBinaryData(win, {
    vertices,
    colors
});
```

or

```ts
win.binaryData.vertices = vertices;
```

---

## Intended Usage

Payload:

```ts
selectedRay
zoomLevel
activeSurface
```

Custom Props:

```ts
plotDataVersion
renderFlags
```

Binary Data:

```ts
Float32Array
Float64Array
Meshes
Images
Raytrace Results
```

---

# Callback Props

## Problem

Normal Svelte allows:

```ts
props: {
    onSelect(row) {
        ...
    }
}
```

because everything exists in the same JavaScript runtime.

---

Detached windows break this assumption.

Closures cannot be serialized:

```ts
(row) => {
    ...
}
```

cannot be sent through:

- BroadcastChannel
- postMessage
- Tauri events

---

# RPC-based Callback Model

Internal conversion:

```ts
props: {
    onSelect: callback
}
```

↓

```ts
{
    onSelect: {
        callbackId: "cb-123"
    }
}
```

WindowRpc registers:

```ts
rpc.register("cb-123", callback);
```

---

When the detached component executes:

```ts
await props.onSelect(row);
```

the framework internally performs:

```ts
rpc.invoke("cb-123", row);
```

---

## Important Design Goal

The developer should still write:

```ts
props: {
    onSelect(row) {
        ...
    }
}
```

No RPC knowledge required.

Framework handles transport automatically.

---

# Layer Responsibilities

## WindowManager

Responsible for:

```text
Open windows
Close windows
State ownership
Payload ownership
Registry updates
```

Should not care about transport details.

---

## ComponentRenderer

Responsible for:

```text
Rendering
Payload observation
Detecting detached parents
Detecting detached children
Synchronization triggering
```

---

## WindowSync

Responsible for:

```text
BroadcastChannel
postMessage
Tauri events
Transport abstraction
```

---

## WindowRpc

Responsible for:

```text
Callbacks
Request/response communication
Remote function invocation
```

---

# Long-Term Vision

A component should be written exactly as if it were part of a normal Svelte application:

```svelte
<MyGraph
    data={win.payload.data}
    onSelect={handleSelect}
/>
```

The developer should never need to care whether that component is rendered:

- Locally
- Detached
- In another browser window
- In a Tauri window

Switching from Browser to Tauri should ideally require changes only to the backend configuration:

```ts
initializeWindowManager({
    backend: new BrowserBackend()
});
```

↓

```ts
initializeWindowManager({
    backend: new TauriBackend()
});
```

with no component code changes.

That is the primary architectural goal of the framework.