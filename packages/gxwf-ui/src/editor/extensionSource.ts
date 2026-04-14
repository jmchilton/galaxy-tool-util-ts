// Phase 2: extension-source indirection. Resolves a VITE_GXWF_EXT_SOURCE spec
// to a base URL and registers the galaxy-workflows-vscode extension with
// monaco-vscode-api.
//
// Spec formats:
//   folder:/abs/path        (dev — Vite /@fs route, live extension checkout)
//   vsix:<url-prefix>       (everywhere else — unpacked vsix directory)
//
// Both shapes converge on `loadFromBase(baseUrl)`. The staging script
// (scripts/stage-extension.mjs) unzips a contributor-supplied .vsix into
// public/ext/galaxy-workflows/ for the `vsix:` case; in production the serving
// app is expected to unpack the extension at deploy/startup time and expose
// the same directory layout. No in-browser unzip, no cross-context blob URLs.

import {
  registerExtension,
  ExtensionHostKind,
  type IExtensionManifest,
  type RegisterLocalExtensionResult,
} from "@codingame/monaco-vscode-api/extensions";

export type ExtensionSource = { kind: "folder"; path: string } | { kind: "vsix"; url: string };

const DEFAULT_SPEC = "vsix:/ext/galaxy-workflows";
const EXTENSION_PATH = "/galaxy-workflows";

// LSP server bundles and the browser entry live outside manifest.contributes
// so we can't discover them via the manifest walk; pinned by EXT_COMMIT.md.
const EXTRA_FOLDER_FILES = [
  "server/gx-workflow-ls-native/dist/web/nativeServer.js",
  "server/gx-workflow-ls-format2/dist/web/gxFormat2Server.js",
];

export function parseExtensionSource(spec: string | undefined): ExtensionSource {
  const value = spec && spec.length > 0 ? spec : DEFAULT_SPEC;
  const colon = value.indexOf(":");
  if (colon < 0) throw new Error(`Invalid VITE_GXWF_EXT_SOURCE spec: ${value}`);
  const scheme = value.slice(0, colon);
  const rest = value.slice(colon + 1);
  if (scheme === "folder") {
    if (!rest.startsWith("/")) {
      throw new Error(`folder: source requires an absolute path (got "${rest}")`);
    }
    return { kind: "folder", path: rest };
  }
  if (scheme === "vsix") {
    return { kind: "vsix", url: rest };
  }
  throw new Error(`Unknown VITE_GXWF_EXT_SOURCE scheme: ${scheme}`);
}

// File paths in the manifest are relative to the extension root and may use a
// leading `./`. registerFileUrl requires the relative form without the dot.
function normalizeExtRelative(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\//, "");
}

// Walk contribution points that reference on-disk files. Keep this list
// aligned with what galaxy-workflows-vscode actually uses; new contribution
// types will need to be added as they appear.
function collectManifestFiles(manifest: IExtensionManifest): string[] {
  const out = new Set<string>();
  const contributes = (manifest.contributes ?? {}) as Record<string, unknown>;
  const langs = contributes.languages as { configuration?: string }[] | undefined;
  langs?.forEach((l) => l.configuration && out.add(normalizeExtRelative(l.configuration)));
  const grammars = contributes.grammars as { path?: string }[] | undefined;
  grammars?.forEach((g) => g.path && out.add(normalizeExtRelative(g.path)));
  const themes = contributes.themes as { path?: string }[] | undefined;
  themes?.forEach((t) => t.path && out.add(normalizeExtRelative(t.path)));
  const snippets = contributes.snippets as { path?: string }[] | undefined;
  snippets?.forEach((s) => s.path && out.add(normalizeExtRelative(s.path)));
  // `_loadCommonJSModule` appends `.js` itself; strip a trailing `.js` here so
  // we don't double-suffix.
  const browser = manifest.browser;
  if (typeof browser === "string") {
    out.add(normalizeExtRelative(browser.replace(/\.js$/, "") + ".js"));
  }
  return [...out];
}

// Absolute URL with origin required: URI.parse defaults scheme-less to file:
// which the browser refuses from an http: origin (Phase 0 #5).
async function loadFromBase(baseUrl: string): Promise<RegisterLocalExtensionResult> {
  const url = (rel: string) => `${baseUrl}/${rel}`;
  const manifest = (await (await fetch(url("package.json"))).json()) as IExtensionManifest;
  const result = registerExtension(manifest, ExtensionHostKind.LocalWebWorker, {
    path: EXTENSION_PATH,
  });
  const files = [...collectManifestFiles(manifest), ...EXTRA_FOLDER_FILES];
  for (const rel of files) result.registerFileUrl(rel, url(rel));
  await result.whenReady();
  return result;
}

function loadFromFolder(src: { path: string }): Promise<RegisterLocalExtensionResult> {
  return loadFromBase(`${self.location.origin}/@fs${src.path}`);
}

function loadFromVsix(src: { url: string }): Promise<RegisterLocalExtensionResult> {
  const trimmed = src.url.replace(/\/+$/, "");
  const baseUrl = /^https?:\/\//.test(trimmed) ? trimmed : `${self.location.origin}${trimmed}`;
  return loadFromBase(baseUrl);
}

export function loadExtensionSource(src: ExtensionSource): Promise<RegisterLocalExtensionResult> {
  switch (src.kind) {
    case "folder":
      return loadFromFolder(src);
    case "vsix":
      return loadFromVsix(src);
  }
}

let loaded: Promise<RegisterLocalExtensionResult> | null = null;

export function loadGalaxyWorkflowsExtension(): Promise<RegisterLocalExtensionResult> {
  if (loaded) return loaded;
  loaded = (async () => {
    const src = parseExtensionSource(import.meta.env.VITE_GXWF_EXT_SOURCE);
    return loadExtensionSource(src);
  })();
  return loaded;
}
