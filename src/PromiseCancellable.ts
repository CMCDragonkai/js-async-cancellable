import type { PromiseCancellableController } from './types.js';

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
    }
    return pC;
  }

  public static from<T>(
    p: PromiseLike<T>,
    controller?: PromiseCancellableController,
  ): PromiseCancellable<T> {
    return new this<T>((resolve, reject) => {
      void p.then(resolve, reject);
    }, controller);
  }

  protected readonly reject: (reason?: any) => void;
  protected abortController: AbortController;

  public constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void,
      signal: AbortSignal,
    ) => void,
    controller?: PromiseCancellableController,
  ) {
    let abortController: AbortController;
    let signal: AbortSignal;
    let signalHandled: boolean;
    if (typeof controller === 'function') {
      abortController = new AbortController();
      controller(abortController.signal);
      signal = abortController.signal;
      signalHandled = true;
    } else if (controller != null) {
      abortController = controller;
      signal = controller.signal;
      signalHandled = true;
    } else {
      abortController = new AbortController();
      signal = new Proxy(abortController.signal, {
        get(target, prop, receiver) {
          if (prop === 'addEventListener') {
            return function addEventListener(...args) {
              signalHandled = true;
              return target[prop].apply(this, args);
            };
          } else {
            return Reflect.get(target, prop, receiver);
          }
        },
        set(target, prop, value) {
          if (prop === 'onabort') {
            signalHandled = true;
          }
          return Reflect.set(target, prop, value);
        },
        deleteProperty(target, prop) {
          if (prop === 'onabort') {
            signalHandled = true;
          }
          return Reflect.deleteProperty(target, prop);
        },
      });
      signalHandled = false;
    }
    let reject_: (reason?: any) => void;
    super((resolve, reject) => {
      reject_ = (reason?: any) => {
        // This swaps the `DOMException [AbortError]` for `undefined`.
        // This is because we expect aborting or cancelling with `undefined`
        // should mean rejection of `undefined`.
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          reason = undefined;
        }
        reject(reason);
      };
      executor(resolve, reject_, signal);
    });
    if (!signalHandled) {
      abortController.signal.addEventListener(
        'abort',
        () => {
          reject_(abortController.signal.reason);
        },
        { once: true },
      );
    }
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
