// Minimal in-memory FileSystemProvider under the `gxwf-ui` scheme. The
// Galaxy Workflows extension expects a workspace, and LSP diagnostics are
// associated with a file URI the extension host can read. A single provider
// instance is registered lazily on first file creation; subsequent files
// are upserted into the same provider.

import {
  RegisteredFileSystemProvider,
  RegisteredMemoryFile,
  registerFileSystemOverlay,
} from "@codingame/monaco-vscode-files-service-override";
import * as monaco from "monaco-editor";

export const GXWF_FS_SCHEME = "gxwf-ui";

let provider: RegisteredFileSystemProvider | null = null;

// registerCustomProvider throws after `initialize` runs (services-initialized
// guard). registerFileSystemOverlay is the post-init-safe equivalent; priority
// 1 puts our provider in front of the default in-memory provider.
function ensureProvider(): RegisteredFileSystemProvider {
  if (provider) return provider;
  provider = new RegisteredFileSystemProvider(false);
  registerFileSystemOverlay(1, provider);
  return provider;
}

export function gxwfUri(fileName: string): monaco.Uri {
  const safe = fileName.replace(/^\/+/, "");
  return monaco.Uri.parse(`${GXWF_FS_SCHEME}:///${safe}`);
}

export function upsertMemoryFile(fileName: string, content: string): monaco.Uri {
  const p = ensureProvider();
  const uri = gxwfUri(fileName);
  // RegisteredFileSystemProvider lets us replace files by re-registering.
  // registerFile returns a disposable; we intentionally keep entries alive
  // for the editor's lifetime.
  p.registerFile(new RegisteredMemoryFile(uri, content));
  return uri;
}
