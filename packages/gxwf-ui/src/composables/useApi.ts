import { createGxwfClient } from "@galaxy-tool-util/gxwf-client";
import type { GxwfClient } from "@galaxy-tool-util/gxwf-client";

// In development, Vite proxies /workflows and /api to the backend (localhost:8000).
// In production, serve the app from the same origin as the API.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

let _client: GxwfClient | null = null;

export function useApi(): GxwfClient {
  if (!_client) {
    _client = createGxwfClient(BASE_URL);
  }
  return _client;
}
