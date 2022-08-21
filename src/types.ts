type PromiseCancellableController =
  | ((signal: AbortSignal) => void)
  | AbortController;

export type { PromiseCancellableController };
