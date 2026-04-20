// Synthetic "gxwf-themes" extension — contributes the gxwf-dark and gxwf-light
// VS Code color themes to the workbench theme service.
//
// monaco-vscode-api routes theme handling through the workbench's
// IThemeService. The supported path to add a theme is via an extension
// manifest's `contributes.themes` entry — `monaco.editor.defineTheme` throws
// under our service-override stack. Themes selected in user config by their
// settings id (`id || label`) are resolved to these JSONs at runtime.

import {
  registerExtension,
  ExtensionHostKind,
  type IExtensionManifest,
  type RegisterLocalExtensionResult,
} from "@codingame/monaco-vscode-api/extensions";
import gxwfDarkUrl from "./themes/gxwf-dark.json?url";
import gxwfLightUrl from "./themes/gxwf-light.json?url";

const EXTENSION_PATH = "/gxwf-themes";

const manifest: IExtensionManifest = {
  name: "gxwf-themes",
  publisher: "galaxyproject",
  version: "0.0.0",
  engines: { vscode: "*" },
  contributes: {
    themes: [
      {
        id: "gxwf-dark",
        label: "Galaxy Workflows Dark",
        uiTheme: "vs-dark",
        path: "./themes/gxwf-dark.json",
      },
      {
        id: "gxwf-light",
        label: "Galaxy Workflows Light",
        uiTheme: "vs",
        path: "./themes/gxwf-light.json",
      },
    ],
  },
};

let loaded: Promise<RegisterLocalExtensionResult> | null = null;

export function loadGxwfThemesExtension(): Promise<RegisterLocalExtensionResult> {
  if (loaded) return loaded;
  loaded = (async () => {
    const result = registerExtension(manifest, ExtensionHostKind.LocalWebWorker, {
      path: EXTENSION_PATH,
    });
    result.registerFileUrl("themes/gxwf-dark.json", gxwfDarkUrl);
    result.registerFileUrl("themes/gxwf-light.json", gxwfLightUrl);
    await result.whenReady();
    return result;
  })();
  return loaded;
}
