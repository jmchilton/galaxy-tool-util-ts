/** Optional sink for recoverable diagnostics emitted by core services. */
export type DiagnosticSink = (message: string) => void;

/** Default sink for library consumers: recoverable failures stay silent. */
export const ignoreDiagnostic: DiagnosticSink = () => {};
