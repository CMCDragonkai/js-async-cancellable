import PromiseCancellable from '#PromiseCancellable.js';

describe(PromiseCancellable.name, () => {
  function f(ctx?: { signal?: AbortSignal }): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve('Result');
      }, 100);
      if (ctx?.signal != null) {
        ctx.signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timeout);
            if (ctx.signal!.reason === undefined) {
              reject(new Error('Aborted F'));
            } else {
              // @ts-ignore node supports cause property
              reject(new Error('Aborted F', { cause: ctx.signal!.reason }));
            }
          },
          { once: true },
        );
      }
    });
  }
  describe('new PromiseCancellable', () => {
    test('cancel with undefined reason', async () => {
      const pC = new PromiseCancellable<void>((resolve) => {
        setTimeout(() => resolve(), 10);
      });
      pC.cancel();
      await expect(pC).rejects.toBeUndefined();
    });
    test('default is early rejection', async () => {
      const pC = new PromiseCancellable<void>((resolve) => {
        setTimeout(() => resolve(), 10);
      });
      pC.cancel('cancellation');
      await expect(pC).rejects.toBe('cancellation');
    });
    test('override default early rejection by interacting with signal', async () => {
      const p1 = new PromiseCancellable<void>((resolve, _reject, signal) => {
        // @ts-ignore force delete
        delete signal.onabort;
        setTimeout(() => resolve(), 10);
      });
      p1.cancel('cancellation');
      await expect(p1).resolves.toBeUndefined();
      const p2 = new PromiseCancellable<void>((resolve, _reject, signal) => {
        signal.onabort = null;
        setTimeout(() => resolve(), 10);
      });
      p2.cancel('cancellation');
      await expect(p2).resolves.toBeUndefined();
      const p3 = new PromiseCancellable<void>((resolve, _reject, signal) => {
        signal.onabort = () => {};
        setTimeout(() => resolve(), 10);
      });
      p3.cancel('cancellation');
      await expect(p3).resolves.toBeUndefined();
      const p4 = new PromiseCancellable<void>((resolve, _reject, signal) => {
        signal.addEventListener('abort', () => {});
        setTimeout(() => resolve(), 10);
      });
      p4.cancel('cancellation');
      await expect(p4).resolves.toBeUndefined();
      // This will not override default behaviour
      const p5 = new PromiseCancellable<void>((resolve, _reject, _signal) => {
        setTimeout(() => resolve(), 10);
      });
      p5.cancel('cancellation');
      // This will cancel with `undefined`
      // Notice that the internal `signal.reason` is in fact `DOMException`
      // However at the end it will be rejected as `undefined`.
      await expect(p5).rejects.toBe('cancellation');
      const p6 = new PromiseCancellable<void>((resolve, reject, signal) => {
        signal.onabort = () => {
          expect(signal.reason).toBeInstanceOf(DOMException);
          expect(signal.reason.name).toBe('AbortError');
          reject(signal.reason);
        };
        setTimeout(() => resolve(), 10);
      });
      p6.cancel();
      await expect(p6).rejects.toBeUndefined();
      const abc = new AbortController();
      const p7 = new PromiseCancellable<void>((resolve, reject, signal) => {
        if (signal.aborted) {
          reject(signal.reason);
        }
        signal.addEventListener('abort', () => {
          reject(signal.reason);
        });
        setTimeout(() => {
          resolve();
        }, 10);
      }, abc);
      abc.abort();
      await expect(p7).rejects.toBeUndefined();
    });
    test('constructing promise cancellable', async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const pC = new PromiseCancellable<void>((resolve, reject, signal) => {
        timeout = setTimeout(() => resolve(), 5000);
        signal.onabort = () => {
          clearTimeout(timeout);
          timeout = undefined;
          reject(signal.reason);
        };
      });
      expect(timeout).toBeDefined();
      pC.cancel('cancellation');
      expect(timeout).toBeUndefined();
      await expect(pC).rejects.toBe('cancellation');
    });
    test('cancelling cancellable function with signal', async () => {
      const pC = new PromiseCancellable<string>((resolve, reject, signal) => {
        const p = f({ signal });
        void p.then(resolve, reject);
      });
      const e = new Error('Abort Reason');
      pC.cancel(e);
      await expect(pC).rejects.toThrow('Aborted F');
      await expect(pC).rejects.toHaveProperty('cause', e);
    });
  });
  describe('PromiseCancellable.resolve & PromiseCancellable.reject', () => {
    test('resolve regular values', async () => {
      const p = PromiseCancellable.resolve(1);
      await expect(p).resolves.toBe(1);
    });
    test('rejecting regular values', async () => {
      const p = PromiseCancellable.reject(1);
      await expect(p).rejects.toBe(1);
    });
    test('resolve promises', async () => {
      // Resolving an existing `PromiseCancellable` returns the same object
      const p1 = PromiseCancellable.resolve(1);
      const p2 = PromiseCancellable.resolve(p1);
      expect(p2).toBe(p1);
      await expect(p2).resolves.toBe(1);
      // Resolving an existing `Promise` ensures a wrapper
      const p3 = Promise.resolve(1);
      const p4 = PromiseCancellable.resolve(p3);
      expect(p4).not.toBe(p3);
    });
    test('rejecting promises', async () => {
      const p1 = PromiseCancellable.resolve(1);
      const p2 = PromiseCancellable.reject(p1);
      expect(p1).not.toBe(p2);
      await expect(p2).rejects.toBe(p1);
      await expect(p1).resolves.toBe(1);
    });
    test('cancelling after resolution is a noop', async () => {
      const p = PromiseCancellable.resolve(1);
      p.cancel(2);
      await expect(p).resolves.toBe(1);
    });
    test('cancelling after rejection is a noop', async () => {
      const p = PromiseCancellable.reject(1);
      p.cancel(2);
      await expect(p).rejects.toBe(1);
    });
  });
  describe('PromiseCancellable.from', () => {
    test('default cancellation is early rejection', async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const p = new Promise<void>((resolve) => {
        timeout = setTimeout(() => {
          timeout = undefined;
          resolve();
        }, 10);
      });
      const pC = PromiseCancellable.from(p);
      const e = new Error('early rejection');
      pC.cancel(e);
      expect(timeout).toBeDefined();
      await expect(pC).rejects.toThrow(e);
    });
    test('from a cancellable function with abort controller', async () => {
      const abortController = new AbortController();
      const p = f({ signal: abortController.signal });
      const pC = PromiseCancellable.from(p, abortController);
      const e = new Error('Abort Reason');
      pC.cancel(e);
      await expect(pC).rejects.toThrow('Aborted F');
      await expect(pC).rejects.toHaveProperty('cause', e);
    });
    test('from a cancellable function with default early rejection', async () => {
      const abortController = new AbortController();
      const p = f({ signal: abortController.signal });
      const pC = PromiseCancellable.from(p);
      pC.cancel();
      await expect(pC).rejects.toBeUndefined();
      await expect(p).resolves.toBe('Result');
    });
  });
  describe('PromiseCancellable.then', () => {
    test('p3 = p1.then(() => p2) - p2 rejection propagates to p3', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      let p2: Promise<string>;
      const p2Resolve = jest.fn().mockImplementation(() => {
        p2 = new Promise<string>((resolve, reject) => {
          reject('P2 abort beginning');
        });
        return p2;
      });
      const p2Reject = jest.fn().mockImplementation((r) => {
        throw r;
      });
      const p3 = p1.then(p2Resolve, p2Reject);
      await expect(p3).rejects.toBe('P2 abort beginning');
      await expect(p1).resolves.toBe('P1 result');
      expect(p2Resolve).toBeCalledWith('P1 result', expect.any(AbortSignal));
      expect(p2Reject).not.toBeCalled();
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
    test('p3 = p1.then(() => p2) - p3 cancellation results in early rejection of p3 and p2', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      let p2: Promise<string>;
      const p2Resolve = jest.fn().mockImplementation((value, signal) => {
        // This is called because `p3` cancellation is an early rejection
        // of `p3`, while `p1` is still running `p2` is bound to `p1`
        p2 = new Promise<string>((resolve, reject) => {
          expect(signal.aborted).toBe(true);
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => {
            resolve(`${value} P2 result`);
          }, 100);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              reject('P2 abort during');
            },
            { once: true },
          );
        });
        return p2;
      });
      const p2Reject = jest.fn().mockImplementation((r) => {
        throw r;
      });
      const p3 = p1.then(p2Resolve, p2Reject);
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P3 abort');
      await expect(p1).resolves.toBe('P1 result');
      expect(p2Resolve).toBeCalledWith('P1 result', expect.any(AbortSignal));
      expect(p2Reject).not.toBeCalled();
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
    test('p3 = p1.then(() => p2) - delayed p3 cancellation results in early rejection of p3 and late rejection of p2', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      let p2: Promise<string>;
      const p2Resolve = jest.fn().mockImplementation((value, signal) => {
        p2 = new Promise<string>((resolve, reject) => {
          // This runs earlier than the cancellation of `p3`
          // therefore it is not yet aborted
          expect(signal.aborted).toBe(false);
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => {
            resolve(`${value} P2 result`);
          }, 100);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              reject('P2 abort during');
            },
            { once: true },
          );
        });
        return p2;
      });
      const p2Reject = jest.fn().mockImplementation((r) => {
        throw r;
      });
      const p3 = p1.then(p2Resolve, p2Reject);
      await expect(p1).resolves.toBe('P1 result');
      expect(p2Resolve).toBeCalledWith('P1 result', expect.any(AbortSignal));
      expect(p2Reject).not.toBeCalled();
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P3 abort');
      await expect(p2!).rejects.toBe('P2 abort during');
    });
    test('p3 = p1.then(() => p2) - p3 cancellation chained to p1 cancellation propagates rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      let p2: Promise<string>;
      const p2Resolve = jest.fn().mockImplementation((value, signal) => {
        p2 = new PromiseCancellable<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => {
            resolve(`${value} P2 result`);
          }, 100);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              reject('P2 abort during');
            },
            { once: true },
          );
        });
        return p2;
      });
      const p2Reject = jest.fn().mockImplementation((reason, signal) => {
        expect(signal.aborted).toBe(true);
        throw reason;
      });
      const p3 = p1.then(p2Resolve, p2Reject, (signal) => {
        signal.addEventListener(
          'abort',
          () => {
            p1.cancel(signal.reason);
          },
          { once: true },
        );
      });
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P1 abort');
      await expect(p1).rejects.toBe('P1 abort');
      expect(p2Resolve).not.toBeCalled();
      expect(p2Reject).toBeCalledWith('P1 abort', expect.any(AbortSignal));
      expect(p2!).toBeUndefined();
    });
  });
  describe('PromiseCancellable.catch', () => {
    test('p3 = p1.catch(() => p2) - rejection propagates p1 to p2 to p3', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject) => {
        setTimeout(() => reject('P1 reject'), 100);
      });
      let p2: Promise<string>;
      const p2Catch = jest.fn().mockImplementation((reason, signal) => {
        expect(signal.aborted).toBe(false);
        p2 = new Promise<string>((resolve, reject) => {
          reject('P2 abort beginning');
        });
        return p2;
      });
      const p3 = p1.catch(p2Catch);
      await expect(p3).rejects.toBe('P2 abort beginning');
      await expect(p1).rejects.toBe('P1 reject');
      expect(p2Catch).toBeCalledWith('P1 reject', expect.any(AbortSignal));
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
    test('p3 = p1.catch(() => p2) - resolution propagates p1 to p3', async () => {
      const p1 = new PromiseCancellable<string>((resolve) => {
        setTimeout(() => resolve('P1 result'), 100);
      });
      let p2: PromiseCancellable<string>;
      const p2Catch = jest.fn().mockImplementation(() => {
        p2 = new PromiseCancellable<string>((resolve, reject) => {
          reject('P2 abort beginning');
        });
        return p2;
      });
      const p3 = p1.catch(p2Catch);
      await expect(p3).resolves.toBe('P1 result');
      await expect(p1).resolves.toBe('P1 result');
      expect(p2Catch).not.toBeCalled();
      expect(p2!).toBeUndefined();
    });
    test('p3 = p1.catch(() => p2) - p3 cancellation results in early rejection of p3 and p2', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject) => {
        setTimeout(() => reject('P1 reject'), 100);
      });
      let p2: Promise<string>;
      const p2Catch = jest.fn().mockImplementation((reason, signal) => {
        expect(signal.aborted).toBe(true);
        p2 = new Promise<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          reject('P2 abort during');
        });
        return p2;
      });
      const p3 = p1.catch(p2Catch);
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P3 abort');
      await expect(p1).rejects.toBe('P1 reject');
      expect(p2Catch).toBeCalledWith('P1 reject', expect.any(AbortSignal));
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
    test('p3 = p1.catch(() => p2) - delayed p3 cancellation results in early rejection of p3 and late rejection of p2', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject) => {
        setTimeout(() => reject('P1 reject'), 100);
      });
      let p2: Promise<string>;
      const p2Catch = jest.fn().mockImplementation((reason, signal) => {
        expect(signal.aborted).toBe(false);
        p2 = new Promise<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => resolve('P2 result'), 100);
          signal.onabort = () => {
            clearTimeout(timeout);
            reject('P2 abort during');
          };
        });
        return p2;
      });
      const p3 = p1.catch(p2Catch);
      await expect(p1).rejects.toBe('P1 reject');
      expect(p2Catch).toBeCalledWith('P1 reject', expect.any(AbortSignal));
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P3 abort');
      await expect(p2!).rejects.toBe('P2 abort during');
    });
    test('p3 = p1.catch(() => p2) - p3 cancellation chained to p1 cancellation propagates rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      let p2: Promise<string>;
      const p2Catch = jest.fn().mockImplementation((reason, signal) => {
        expect(signal.aborted).toBe(true);
        p2 = new Promise<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => resolve('P2 result'), 100);
          signal.onabort = () => {
            clearTimeout(timeout);
            reject('P2 abort during');
          };
        });
        return p2;
      });
      const p3 = p1.catch(p2Catch, (signal) => {
        signal.onabort = () => {
          p1.cancel(signal.reason);
        };
      });
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P2 abort beginning');
      await expect(p1).rejects.toBe('P1 abort');
      expect(p2Catch).toBeCalledWith('P1 abort', expect.any(AbortSignal));
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
  });
  describe('PromiseCancellable.finally', () => {
    test('p3 = p1.finally(() => p2) - p2 cannot affect the resolved result of p1', async () => {
      const p1 = new PromiseCancellable<string>((resolve) => {
        setTimeout(() => resolve('P1 result'), 100);
      });
      let p2: PromiseCancellable<string>;
      const p2Finally = jest.fn().mockImplementation(() => {
        p2 = new PromiseCancellable<string>((resolve) => {
          setTimeout(() => resolve('P2 result'), 100);
        });
        return p2;
      });
      const p3 = p1.finally(p2Finally);
      await expect(p3).resolves.toBe('P1 result');
      expect(p2Finally).toBeCalledWith(expect.any(AbortSignal));
      await expect(p2!).resolves.toBe('P2 result');
    });
    test('p3 = p1.finally(() => p2) - rejection propagates p1 to p2 to p3', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject) => {
        setTimeout(() => reject('P1 reject'), 100);
      });
      let p2: Promise<string>;
      const p2Finally = jest.fn().mockImplementation((signal) => {
        expect(signal.aborted).toBe(false);
        p2 = new Promise<string>((resolve, reject) => {
          reject('P2 abort beginning');
        });
        return p2;
      });
      const p3 = p1.finally(p2Finally);
      await expect(p3).rejects.toBe('P2 abort beginning');
      await expect(p1).rejects.toBe('P1 reject');
      expect(p2Finally).toBeCalledWith(expect.any(AbortSignal));
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
    test('p3 = p1.finally(() => p2) - p3 cancellation results in early rejection of p3 and p2', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject) => {
        setTimeout(() => reject('P1 reject'), 100);
      });
      let p2: PromiseCancellable<string>;
      const p2Finally = jest.fn().mockImplementation((signal) => {
        expect(signal.aborted).toBe(true);
        p2 = new PromiseCancellable<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => reject('P2 reject'), 100);
          signal.onabort = () => {
            clearTimeout(timeout);
            reject('P2 abort during');
          };
        });
        return p2;
      });
      const p3 = p1.finally(p2Finally);
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P3 abort');
      await expect(p1).rejects.toBe('P1 reject');
      expect(p2Finally).toBeCalledWith(expect.any(AbortSignal));
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
    test('p3 = p1.finally(() => p2) - delayed p3 cancellation results in early rejection of p3 and late rejection of p2', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject) => {
        setTimeout(() => reject('P1 reject'), 100);
      });
      let p2: PromiseCancellable<string>;
      const p2Finally = jest.fn().mockImplementation((signal) => {
        expect(signal.aborted).toBe(false);
        p2 = new PromiseCancellable<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => reject('P2 reject'), 100);
          signal.onabort = () => {
            clearTimeout(timeout);
            reject('P2 abort during');
          };
        });
        return p2;
      });
      const p3 = p1.finally(p2Finally);
      await expect(p1).rejects.toBe('P1 reject');
      expect(p2Finally).toBeCalledWith(expect.any(AbortSignal));
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P3 abort');
      await expect(p2!).rejects.toBe('P2 abort during');
    });
    test('p3 = p1.finally(() => p2) - p3 cancellation chained to p1 cancellation propagates rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => reject('P1 reject'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      let p2: PromiseCancellable<string>;
      const p2Finally = jest.fn().mockImplementation((signal) => {
        expect(signal.aborted).toBe(true);
        p2 = new PromiseCancellable<string>((resolve, reject) => {
          if (signal.aborted) {
            reject('P2 abort beginning');
            return;
          }
          const timeout = setTimeout(() => reject('P2 reject'), 100);
          signal.onabort = () => {
            clearTimeout(timeout);
            reject('P2 abort during');
          };
        });
        return p2;
      });
      const p3 = p1.finally(p2Finally, (signal) => {
        signal.onabort = () => {
          p1.cancel(signal.reason);
        };
      });
      p3.cancel('P3 abort');
      await expect(p3).rejects.toBe('P2 abort beginning');
      await expect(p1).rejects.toBe('P1 abort');
      expect(p2Finally).toBeCalledWith(expect.any(AbortSignal));
      await expect(p2!).rejects.toBe('P2 abort beginning');
    });
  });
  describe('PromiseCancellable.all', () => {
    test('resolve regular values and promises', async () => {
      const p = PromiseCancellable.all([
        Promise.resolve(1),
        PromiseCancellable.resolve(2),
        3,
        4,
      ]);
      const results = await p;
      expect(results).toStrictEqual([1, 2, 3, 4]);
    });
    test('rejecting promises', async () => {
      const p1 = PromiseCancellable.all([
        Promise.reject(1),
        PromiseCancellable.resolve(2),
        3,
        4,
      ]);
      await expect(p1).rejects.toBe(1);
      const p2 = PromiseCancellable.all([
        Promise.resolve(1),
        PromiseCancellable.reject(2),
        3,
        4,
      ]);
      await expect(p2).rejects.toBe(2);
    });
    test('rejection propagates', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject, signal) => {
        const timeout = setTimeout(() => reject('P1 reject'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.all([PromiseCancellable.all([p1])]);
      await expect(p2).rejects.toBe('P1 reject');
    });
    test('default cancellation is early rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.all([p1]);
      p2.cancel('P2 abort');
      await expect(p2).rejects.toBe('P2 abort');
      await expect(p1).resolves.toBe('P1 result');
    });
    test('custom signal handler', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.all(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        (signal) => {
          signal.onabort = () => {
            abortController.abort(signal.reason);
          };
        },
      );
      p.cancel('P abort');
      await expect(p).rejects.toThrow('Aborted F');
      await expect(p).rejects.toHaveProperty('cause', 'P abort');
    });
    test('custom abort controller', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.all(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        abortController,
      );
      p.cancel('P abort');
      await expect(p).rejects.toThrow('Aborted F');
      await expect(p).rejects.toHaveProperty('cause', 'P abort');
    });
  });
  describe('PromiseCancellable.allSettled', () => {
    test('resolve regular values and promises', async () => {
      const p = PromiseCancellable.allSettled([
        Promise.resolve(1),
        PromiseCancellable.resolve(2),
        3,
        4,
      ]);
      const results = await p;
      expect(results).toStrictEqual([
        {
          status: 'fulfilled',
          value: 1,
        },
        {
          status: 'fulfilled',
          value: 2,
        },
        {
          status: 'fulfilled',
          value: 3,
        },
        {
          status: 'fulfilled',
          value: 4,
        },
      ]);
    });
    test('rejecting promises', async () => {
      const p = PromiseCancellable.allSettled([
        Promise.reject(1),
        PromiseCancellable.reject(2),
        3,
        4,
      ]);
      const results = await p;
      expect(results).toStrictEqual([
        {
          status: 'rejected',
          reason: 1,
        },
        {
          status: 'rejected',
          reason: 2,
        },
        {
          status: 'fulfilled',
          value: 3,
        },
        {
          status: 'fulfilled',
          value: 4,
        },
      ]);
    });
    test('rejection propagates', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject, signal) => {
        const timeout = setTimeout(() => reject('P1 reject'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.allSettled([
        PromiseCancellable.allSettled([p1]),
      ]);
      await expect(p2).resolves.toStrictEqual([
        {
          status: 'fulfilled',
          value: [
            {
              status: 'rejected',
              reason: 'P1 reject',
            },
          ],
        },
      ]);
    });
    test('default cancellation is early rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.allSettled([p1]);
      p2.cancel('P2 abort');
      await expect(p2).rejects.toBe('P2 abort');
      await expect(p1).resolves.toBe('P1 result');
    });
    test('custom signal handler', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.allSettled(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        (signal) => {
          signal.onabort = () => {
            abortController.abort(signal.reason);
          };
        },
      );
      p.cancel('P abort');
      const results = await p;
      expect(results).toMatchObject([
        {
          status: 'rejected',
          reason: expect.objectContaining({
            name: 'Error',
            message: 'Aborted F',
            cause: 'P abort',
          }),
        },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            name: 'Error',
            message: 'Aborted F',
            cause: 'P abort',
          }),
        },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            name: 'Error',
            message: 'Aborted F',
            cause: 'P abort',
          }),
        },
      ]);
    });
    test('custom abort controller', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.allSettled(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        abortController,
      );
      p.cancel('P abort');
      const results = await p;
      expect(results).toMatchObject([
        {
          status: 'rejected',
          reason: expect.objectContaining({
            name: 'Error',
            message: 'Aborted F',
            cause: 'P abort',
          }),
        },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            name: 'Error',
            message: 'Aborted F',
            cause: 'P abort',
          }),
        },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            name: 'Error',
            message: 'Aborted F',
            cause: 'P abort',
          }),
        },
      ]);
    });
  });
  describe('PromiseCancellable.race', () => {
    test('resolve regular values and promises', async () => {
      const p1 = PromiseCancellable.race([
        Promise.resolve(1),
        PromiseCancellable.resolve(2),
        3,
        4,
      ]);
      expect([1, 2, 3, 4]).toContain(await p1);
      const p2 = PromiseCancellable.race([
        new Promise((resolve) => setTimeout(() => resolve(1), 100)),
        new Promise((resolve) => setTimeout(() => resolve(2), 50)),
      ]);
      await expect(p2).resolves.toBe(2);
    });
    test('rejecting promises', async () => {
      const p1 = PromiseCancellable.race([
        Promise.reject(1),
        PromiseCancellable.reject(2),
      ]);
      await expect(p1).rejects.toBeDefined();
      try {
        await p1;
      } catch (e) {
        expect([1, 2]).toContain(e);
      }
      const p2 = PromiseCancellable.race([
        new Promise((_resolve, reject) => setTimeout(() => reject(1), 100)),
        new Promise((_resolve, reject) => setTimeout(() => reject(2), 50)),
      ]);
      await expect(p2).rejects.toBe(2);
    });
    test('rejection propagates', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject, signal) => {
        const timeout = setTimeout(() => reject('P1 reject'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.race([PromiseCancellable.race([p1])]);
      await expect(p2).rejects.toBe('P1 reject');
    });
    test('default cancellation is early rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.race([p1]);
      p2.cancel('P2 abort');
      await expect(p2).rejects.toBe('P2 abort');
      await expect(p1).resolves.toBe('P1 result');
    });
    test('custom signal handler', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.race(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        (signal) => {
          signal.onabort = () => {
            abortController.abort(signal.reason);
          };
        },
      );
      p.cancel('P abort');
      await expect(p).rejects.toThrow('Aborted F');
      await expect(p).rejects.toHaveProperty('cause', 'P abort');
    });
    test('custom abort controller', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.race(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        abortController,
      );
      p.cancel('P abort');
      await expect(p).rejects.toThrow('Aborted F');
      await expect(p).rejects.toHaveProperty('cause', 'P abort');
    });
    test('racing signal handler', async () => {
      const racer = jest
        .fn()
        .mockImplementation((name: string, delay: number) => {
          return new PromiseCancellable<string>((resolve, reject, signal) => {
            if (signal.aborted) {
              reject('racer abort beginning');
              return;
            }
            const timeout = setTimeout(
              () => resolve(`racer ${name} result`),
              delay,
            );
            signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timeout);
                reject('racer abort during');
              },
              { once: true },
            );
          });
        });
      const race = [racer('1', 50), racer('2', 100), racer('3', 150)];
      const p = PromiseCancellable.race(race, (signal) => {
        signal.onabort = () => {
          race.map((r) => r.cancel(signal.reason));
        };
      });
      const result = await p;
      p.cancel('P abort');
      expect(result).toBe('racer 1 result');
      await expect(race[1]).rejects.toBe('racer abort during');
      await expect(race[2]).rejects.toBe('racer abort during');
    });
  });
  describe('PromiseCancellable.any', () => {
    test('resolve regular values and promises', async () => {
      const p1 = PromiseCancellable.any([
        Promise.resolve(1),
        PromiseCancellable.resolve(2),
        3,
        Promise.reject(4),
      ]);
      const result = await p1;
      expect([1, 2, 3]).toContain(result);
      expect(result).not.toBe(4);
      const p2 = PromiseCancellable.any([
        new Promise((resolve) => setTimeout(() => resolve(1), 100)),
        new Promise((resolve) => setTimeout(() => resolve(2), 50)),
        new Promise((_resolve, reject) => setTimeout(() => reject(3), 25)),
      ]);
      await expect(p2).resolves.toBe(2);
    });
    test('rejecting promises', async () => {
      const p1 = PromiseCancellable.any([
        Promise.reject(1),
        PromiseCancellable.reject(2),
      ]);
      await expect(p1).rejects.toThrow(AggregateError);
      await expect(p1).rejects.toHaveProperty('errors', [1, 2]);
      const p2 = PromiseCancellable.any([
        new Promise((_resolve, reject) => setTimeout(() => reject(1), 100)),
        new Promise((_resolve, reject) => setTimeout(() => reject(2), 50)),
      ]);
      await expect(p2).rejects.toThrow(AggregateError);
      await expect(p2).rejects.toHaveProperty('errors', [1, 2]);
    });
    test('rejection propagates', async () => {
      const p1 = new PromiseCancellable<string>((_resolve, reject, signal) => {
        const timeout = setTimeout(() => reject('P1 reject'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.any([PromiseCancellable.any([p1])]);
      await expect(p2).rejects.toThrow(AggregateError);
      await expect(p2).rejects.toMatchObject({
        errors: [
          {
            errors: ['P1 reject'],
          },
        ],
      });
    });
    test('default cancellation is early rejection', async () => {
      const p1 = new PromiseCancellable<string>((resolve, reject, signal) => {
        const timeout = setTimeout(() => resolve('P1 result'), 100);
        signal.onabort = () => {
          clearTimeout(timeout);
          reject('P1 abort');
        };
      });
      const p2 = PromiseCancellable.any([p1]);
      p2.cancel('P2 abort');
      await expect(p2).rejects.toBe('P2 abort');
      await expect(p1).resolves.toBe('P1 result');
    });
    test('custom signal handler', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.any(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        (signal) => {
          signal.onabort = () => {
            abortController.abort(signal.reason);
          };
        },
      );
      p.cancel('P abort');
      await expect(p).rejects.toThrow(AggregateError);
      await expect(p).rejects.toMatchObject({
        errors: [
          {
            message: 'Aborted F',
            cause: 'P abort',
          },
          {
            message: 'Aborted F',
            cause: 'P abort',
          },
          {
            message: 'Aborted F',
            cause: 'P abort',
          },
        ],
      });
    });
    test('custom abort controller', async () => {
      const abortController = new AbortController();
      const p = PromiseCancellable.any(
        [
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
          f({ signal: abortController.signal }),
        ],
        abortController,
      );
      p.cancel('P abort');
      await expect(p).rejects.toThrow(AggregateError);
      await expect(p).rejects.toMatchObject({
        errors: [
          {
            message: 'Aborted F',
            cause: 'P abort',
          },
          {
            message: 'Aborted F',
            cause: 'P abort',
          },
          {
            message: 'Aborted F',
            cause: 'P abort',
          },
        ],
      });
    });
  });
});
