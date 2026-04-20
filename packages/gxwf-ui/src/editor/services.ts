// VS Code services are process-global — initUserConfiguration + initialize
// must run exactly once per page load. Singleton promise makes that safe
// against concurrent editor mounts, route navigation, StrictMode-style
// double-invocation, etc.

import { initialize } from "@codingame/monaco-vscode-api";
import getExtensionsOverride from "@codingame/monaco-vscode-extensions-service-override";
import getLanguagesOverride from "@codingame/monaco-vscode-languages-service-override";
import getTextMateOverride from "@codingame/monaco-vscode-textmate-service-override";
import getThemeOverride from "@codingame/monaco-vscode-theme-service-override";
import getConfigurationOverride, {
  initUserConfiguration,
} from "@codingame/monaco-vscode-configuration-service-override";
import getFilesOverride from "@codingame/monaco-vscode-files-service-override";
import getKeybindingsOverride from "@codingame/monaco-vscode-keybindings-service-override";
import getNotificationsOverride from "@codingame/monaco-vscode-notifications-service-override";
import getQuickAccessOverride from "@codingame/monaco-vscode-quickaccess-service-override";
import { loadGxwfThemesExtension } from "./themesExtension";
import { installThemeSync } from "./themeSync";

export interface MonacoUserConfig {
  toolShedUrl?: string;
  toolCacheProxyUrl?: string;
  cacheDbName?: string;
  validationProfile?: "basic" | "advanced";
}

// Boot order: App.vue's <script setup> reads localStorage["gxwf-dark"] and adds
// the `dark` class on <html> synchronously. services.ts init happens from an
// onMounted hook, which runs after that. Classifier reads the class directly;
// localStorage is only a fallback for the first-paint race in test envs where
// the App.vue script might not have run yet.
function initialColorThemeId(): "gxwf-dark" | "gxwf-light" {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "gxwf-dark";
  }
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("gxwf-dark") === "1") {
      return "gxwf-dark";
    }
  } catch {
    // localStorage unavailable (e.g. sandboxed iframe); ignore.
  }
  return "gxwf-light";
}

function buildUserConfigJson(cfg: MonacoUserConfig): string {
  const body: Record<string, unknown> = {
    "galaxyWorkflows.validation.profile": cfg.validationProfile ?? "basic",
    "galaxyWorkflows.toolShed.url": cfg.toolShedUrl ?? "https://toolshed.g2.bx.psu.edu",
    "workbench.colorTheme": initialColorThemeId(),
  };
  if (cfg.toolCacheProxyUrl) body["galaxyWorkflows.toolCacheProxy.url"] = cfg.toolCacheProxyUrl;
  if (cfg.cacheDbName) body["galaxyWorkflows.cacheDbName"] = cfg.cacheDbName;
  return JSON.stringify(body, null, 2);
}

export function buildMonacoUserConfigFromEnv(): MonacoUserConfig {
  const env = import.meta.env;
  const cfg: MonacoUserConfig = {};
  if (env.VITE_GXWF_TOOLSHED_URL) cfg.toolShedUrl = env.VITE_GXWF_TOOLSHED_URL;
  if (env.VITE_GXWF_TOOL_CACHE_PROXY_URL)
    cfg.toolCacheProxyUrl = env.VITE_GXWF_TOOL_CACHE_PROXY_URL;
  if (env.VITE_GXWF_CACHE_DB_NAME) cfg.cacheDbName = env.VITE_GXWF_CACHE_DB_NAME;
  if (env.VITE_GXWF_VALIDATION_PROFILE)
    cfg.validationProfile = env.VITE_GXWF_VALIDATION_PROFILE as "basic" | "advanced";
  return cfg;
}

let servicesReady: Promise<void> | null = null;

export function initMonacoServices(cfg: MonacoUserConfig = {}): Promise<void> {
  if (servicesReady) return servicesReady;
  servicesReady = (async () => {
    // initUserConfiguration must run before `initialize` — it stages config the
    // configuration-service-override consumes during init.
    await initUserConfiguration(buildUserConfigJson(cfg));
    await initialize({
      ...getExtensionsOverride({ enableWorkerExtensionHost: true }),
      ...getLanguagesOverride(),
      ...getTextMateOverride(),
      ...getThemeOverride(),
      ...getConfigurationOverride(),
      ...getFilesOverride(),
      ...getKeybindingsOverride(),
      ...getNotificationsOverride(),
      ...getQuickAccessOverride(),
    });
    // Register branded themes before the first editor mount so the workbench
    // can resolve workbench.colorTheme without falling back to a built-in.
    await loadGxwfThemesExtension();
    // Observe the app's dark-mode toggle and push workbench.colorTheme updates.
    installThemeSync();
  })();
  return servicesReady;
}
