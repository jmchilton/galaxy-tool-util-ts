// Custom extension-host worker entry. monaco-vscode-api's default worker
// reports failed extension fetches as a bare "Failed to fetch" with no URL,
// which is nearly impossible to diagnose. This wrapper logs the URL that
// threw so asset-registration mistakes (wrong scheme, missing
// registerFileUrl entry, etc.) are immediately obvious in devtools.
//
// Mechanism: install a getter/setter on `self.fetch`. monaco-vscode-api's
// `patchFetching` reassigns `self.fetch` after the `vscode.init` handshake;
// the setter captures that patched function. The getter returns our wrapper,
// which routes through the patched fn for URI translation but logs the
// originating URL on failure. A re-entry guard avoids the recursive loop
// caused by the patched fn capturing our wrapper as its own `_fetch`.

const _origNativeFetch: typeof fetch = self.fetch.bind(self);
let _patched: typeof fetch | null = null;
let _depth = 0;

const wrapper: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : ((input as Request)?.url ?? String(input));
  const reentrant = _depth > 0;
  const target = reentrant || !_patched ? _origNativeFetch : _patched;
  _depth++;
  try {
    return await target(input as RequestInfo, init);
  } catch (e) {
    console.error("[ext-host fetch threw]", url, (e as Error)?.message ?? e);
    throw e;
  } finally {
    _depth--;
  }
}) as unknown as typeof fetch;

Object.defineProperty(self, "fetch", {
  configurable: true,
  get() {
    return wrapper;
  },
  set(v: typeof fetch) {
    _patched = v;
  },
});

// Path resolves via the package's `./vscode/*` → `./vscode/src/*.js` export
// rule — NO leading `src/`, the export map adds it. Static import required;
// Vite's worker bundler can't follow a dynamic import here.
import "@codingame/monaco-vscode-api/vscode/vs/workbench/api/worker/extensionHostWorkerMain";
