type PromiseCancellableController =
  | ((signal: AbortSignal) => void)
  | AbortController;

type PromiseLikeCancellable<T> = PromiseLike<T> & {
  cancel(reason?: any): void;
};

export type { PromiseCancellableController, PromiseLikeCancellable };
