import type { PromiseCancellableController } from './types';

class PromiseCancellable<T> extends Promise<T> {
  public static get [Symbol.species](): PromiseConstructor {
    return Promise;
  }

  public static resolve(): PromiseCancellable<void>;
  public static resolve<T>(value: T | PromiseLike<T>): PromiseCancellable<T>;
  public static resolve<T>(
    value?: T | PromiseLike<T>,
  ): PromiseCancellable<void | T> {
    if (value instanceof PromiseCancellable) return value;
    return super.resolve(value) as PromiseCancellable<void | T>;
  }

  public static reject<T = never>(reason?: any): PromiseCancellable<T> {
    return super.reject(reason) as PromiseCancellable<T>;
  }

  public static all<T extends readonly unknown[] | []>(
    values: T,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<{ -readonly [P in keyof T]: Awaited<T[P]> }>;
  public static all<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T>[]>;
  public static all<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T>[]> {
    // The `super.all` calls `new PromiseCancellable`
    const pC = super.all(values) as PromiseCancellable<Awaited<T>[]>;
    if (typeof controller === 'function') {
      pC.abortController = new AbortController();
      controller(pC.abortController.signal);
    } else if (controller != null) {
      pC.abortController = controller;
    } else {
      pC.abortController.signal.addEventListener(
        'abort',
        () => {
          pC.reject(pC.abortController.signal.reason);
        },
        { once: true },
      );
    }
    return pC;
  }

  public static allSettled<T extends readonly unknown[] | []>(
    values: T,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<{
    -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>;
  }>;
  public static allSettled<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<PromiseSettledResult<Awaited<T>>[]>;
  public static allSettled<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<PromiseSettledResult<Awaited<T>>[]> {
    // The `super.allSettled` calls `new PromiseCancellable`
    const pC = super.allSettled(values) as PromiseCancellable<
      PromiseSettledResult<Awaited<T>>[]
    >;
    if (typeof controller === 'function') {
      pC.abortController = new AbortController();
      controller(pC.abortController.signal);
    } else if (controller != null) {
      pC.abortController = controller;
    } else {
      pC.abortController.signal.addEventListener(
        'abort',
        () => {
          pC.reject(pC.abortController.signal.reason);
        },
        { once: true },
      );
    }
    return pC;
  }

  public static race<T extends readonly unknown[] | []>(
    values: T,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T[number]>>;
  public static race<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T>>;
  public static race<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T>> {
    // The `super.race` calls `new PromiseCancellable`
    const pC = super.race(values) as PromiseCancellable<Awaited<T>>;
    if (typeof controller === 'function') {
      pC.abortController = new AbortController();
      controller(pC.abortController.signal);
    } else if (controller != null) {
      pC.abortController = controller;
    } else {
      pC.abortController.signal.addEventListener(
        'abort',
        () => {
          pC.reject(pC.abortController.signal.reason);
        },
        { once: true },
      );
    }
    return pC;
  }

  public static any<T extends readonly unknown[] | []>(
    values: T,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T[number]>>;
  public static any<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T>>;
  public static any<T>(
    values: Iterable<T | PromiseLike<T>>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<Awaited<T>> {
    // The `super.any` calls `new PromiseCancellable`
    const pC = super.any(values) as PromiseCancellable<Awaited<T>>;
    if (typeof controller === 'function') {
      pC.abortController = new AbortController();
      controller(pC.abortController.signal);
    } else if (controller != null) {
      pC.abortController = controller;
    } else {
      pC.abortController.signal.addEventListener(
        'abort',
        () => {
          pC.reject(pC.abortController.signal.reason);
        },
        { once: true },
      );
    }
    return pC;
  }

  public static from<T>(
    p: PromiseLike<T>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<T> {
    if (typeof controller === 'function') {
      return new this<T>((resolve, reject, signal) => {
        controller(signal);
        void p.then(resolve, reject);
      });
    } else if (controller != null) {
      return new this<T>((resolve, reject) => {
        void p.then(resolve, reject);
      }, controller);
    } else {
      return new this<T>((resolve, reject, signal) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(signal.reason);
          },
          { once: true },
        );
        void p.then(resolve, reject);
      });
    }
  }

  protected readonly reject: (reason?: any) => void;
  protected abortController: AbortController;

  public constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void,
      signal: AbortSignal,
    ) => void,
    abortController: AbortController = new AbortController(),
  ) {
    let reject_: (reason?: any) => void;
    super((resolve, reject) => {
      reject_ = reject;
      executor(resolve, reject, abortController.signal);
    });
    this.reject = reject_!;
    this.abortController = abortController;
  }

  public get [Symbol.toStringTag](): string {
    return this.constructor.name;
  }

  public cancel(reason?: any): void {
    this.abortController.abort(reason);
  }

  public then<TResult1 = T, TResult2 = never>(
    onFulfilled?:
      | ((value: T, signal: AbortSignal) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onRejected?:
      | ((reason: any, signal: AbortSignal) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<TResult1 | TResult2> {
    // eslint-disable-next-line prefer-const
    let signal;
    let onFulfilled_;
    let onRejected_;
    if (typeof onFulfilled === 'function') {
      onFulfilled_ = (value: T) => onFulfilled(value, signal);
    }
    if (typeof onRejected === 'function') {
      onRejected_ = (reason: any) => onRejected(reason, signal);
    }
    // The `super.then` uses `Symbol.species`, and it is a native promise
    const p = super.then<TResult1, TResult2>(onFulfilled_, onRejected_);
    const pC = PromiseCancellable.from(p, controller);
    signal = pC.abortController.signal;
    return pC;
  }

  public catch<TResult = never>(
    onRejected?:
      | ((reason: any, signal: AbortSignal) => TResult | PromiseLike<TResult>)
      | undefined
      | null,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<T | TResult> {
    // eslint-disable-next-line prefer-const
    let signal;
    let onRejected_;
    if (typeof onRejected === 'function') {
      onRejected_ = (reason: any) => onRejected(reason, signal);
    }
    // The `super.catch` calls `this.then`
    // so this is already a `PromiseCancellable`
    const pC = super.catch(onRejected_) as PromiseCancellable<T | TResult>;
    if (typeof controller === 'function') {
      pC.abortController = new AbortController();
      controller(pC.abortController.signal);
    } else if (controller != null) {
      pC.abortController = controller;
    }
    signal = pC.abortController.signal;
    return pC;
  }

  public finally(
    onFinally?: ((signal: AbortSignal) => void) | undefined | null,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<T> {
    // eslint-disable-next-line prefer-const
    let signal;
    let onFinally_;
    if (typeof onFinally === 'function') {
      onFinally_ = () => onFinally(signal);
    }
    // The `super.finally` calls `this.then`
    // so this is already a `PromiseCancellable`
    const pC = super.finally(onFinally_) as PromiseCancellable<T>;
    if (typeof controller === 'function') {
      pC.abortController = new AbortController();
      controller(pC.abortController.signal);
    } else if (controller != null) {
      pC.abortController = controller;
    }
    signal = pC.abortController.signal;
    return pC;
  }
}

export default PromiseCancellable;
