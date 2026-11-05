
PerNils Snygg <pernils.snygg @gmail.com>
	
22:20 (för 0 minuter sedan)
	
	
till mig
// Enkel hjälpfunktion för att rensa bort funktioner innan nätverks-utskick
function stripFunctions(obj: any): any {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'function') {
      return undefined; // Ta bort funktionen helt från nätverkspaketet!
    }
    return value;
  }));
}

// I WindowFrame.svelte
$effect(() => {
  if (shouldBroadcast(win)) {
    // 🌟 Vi tar en snapshot, men rensar bort alla callbacks så att det inte kraschar!
    const safeProps = stripFunctions($state.snapshot(win.props));

    void wManager.sync.send(win.winId, {
      props: safeProps
    });
  }
});




// I WindowFrame.svelte (Huvudfönstret agerar Broker) [1.13]
import { WindowRpc, createRpcTransport } from "./windowRpc";

const transport = createRpcTransport(wManager.backend);
const rpc = new WindowRpc(transport, win.winId);

/**
 * Går igenom props djupt. Om den hittar en funktion (callback),
 * registrerar den funktionen i RPC-registret och byter ut den
 * mot en speciell sträng-markör för nätverket.
 */
function transformCallbacksToRpc(obj: any, path = ""): any {
  if (!obj || typeof obj !== "object") return obj;

  const result = Array.isArray(obj) ? [] : {};

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const currentPath = path ? `${path}.${key}` : key;

    if (typeof value === "function") {
      // 🌟 MAGIC: Vi hittade en vanlig Svelte-callback!
      // Registrera den i RPC-registret så den kan anropas utifrån flikarna
      rpc.register(`callback:${currentPath}`, async (...args: unknown[]) => {
        // Kör den RIKTIGA lokala Svelte-funktionen här i huvudfönstret
        return value(...args);
      });

      // Ersätt funktionen med en nätverksvänlig markör i det paketet som skickas
      (result as any)[key] = `__RPC_CALLBACK__:${currentPath}`;
    } else if (typeof value === "object") {
      // Sök vidare djupt i objekt/arrays
      (result as any)[key] = transformCallbacksToRpc(value, currentPath);
    } else {
      (result as any)[key] = value;
    }
  }

  return result;
}

2. Återställaren borta i den fristående fliken (isStandalone)
När din fristående flik tar emot dessa props via WindowSync, så ser den markörsträngen __RPC_CALLBACK__:onSave [1.13]. Då byter fliken ut strängen mot en vanlig levande JavaScript-funktion igen [1.13]!
Här är logiken som körs i din fristående flik (eller i din WindowSync.start mottagare) [1.14]:
typescript

/**
 * Går igenom inkommande props djupt. Om den hittar en RPC-markör,
 * byter den ut den mot en vanlig exekverbar JavaScript-funktion
 * som triggar ett RPC-anrop i bakgrunden.
 */
function restoreRpcToCallbacks(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;

  for (const key of Object.keys(obj)) {
    const value = obj[key];

    if (typeof value === "string" && value.startsWith("__RPC_CALLBACK__:")) {
      const rpcMethodName = value.split("__RPC_CALLBACK__:")[1];

      // 🌟 MAGIC: Ge komponenten en helt vanlig funktion tillbaka!
      obj[key] = async (...args: unknown[]) => {
        console.log(`📡 [Auto-RPC] Anropar master-callback: ${rpcMethodName}`);
        // När fliken kör denna funktion, skickar vi det tyst som ett RPC-kommando
        return rpc.call(`callback:${rpcMethodName}`, ...args);
      };
    } 
else if (typeof value === "object") {
      restoreRpcToCallbacks(value);
    }
  }
  return obj;
}
