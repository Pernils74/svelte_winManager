# Sync-routing

Every transport packet has an explicit sender, recipient and message:

```ts
{
  from: { wManagerId, winId, parentId },
  to: { type: "group", parentId, componentKey },
  message: { type: "sync:props", props }
}
```

Props messages are delivered to every local window session matching
`to.parentId` and `to.componentKey`, except windows whose `wManagerId` matches
the sender runtime. State and RPC messages remain targeted at one window.
Incoming updates are applied without being published again.

```mermaid
sequenceDiagram
    participant S as Sändande WindowSync
    participant T as Transport
    participant R as receivePacket()
    participant G as Grupplyssnare
    participant M as WindowSync / WindowManager
    participant D as Matchande dubbletter

    S->>T: from endpoint + group recipient + sync:props
    T-->>R: Paketet levereras till runtimes
    R->>R: Validerar kuvert och meddelande
    R->>G: Matchar parentId + componentKey
    G->>G: Utesluter win.wManagerId === packet.from.wManagerId
    G->>M: Applicera props utan publicering
    M->>D: Uppdatera matchande lokala instanser
```

```mermaid
flowchart LR
    P["packet.from<br/>wManagerId, winId, parentId"] --> T["packet.to"]
    T --> G{"type: group"}
    G --> F{"Samma parentId<br/>och componentKey?"}
    F -->|Nej| X["Ignorera"]
    F -->|Ja| R{"win.wManagerId<br/>!= packet.from.wManagerId?"}
    R -->|Nej| X
    R -->|Ja| A["Applicera props<br/>utan återpublicering"]
```
