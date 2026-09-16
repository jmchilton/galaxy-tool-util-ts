/**
 * Framework-agnostic HTTP error consumed by both gxwf-web and tool-cache-proxy
 * adapters. Status + message + optional structured detail.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly detail?: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.detail = detail;
  }
}
