/// <reference types="vite/client" />

declare module "cytoscape-popper";

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GXWF_EXT_SOURCE?: string;
  readonly VITE_GXWF_TOOLSHED_URL?: string;
  readonly VITE_GXWF_TOOL_CACHE_PROXY_URL?: string;
  readonly VITE_GXWF_CACHE_DB_NAME?: string;
  readonly VITE_GXWF_VALIDATION_PROFILE?: string;
  /** Pin the edge-annotations transport: "server", "client", or "auto" (default). */
  readonly VITE_GXWF_EDGE_ANNOTATIONS_MODE?: string;
}
