import PromiseCancellable from '@/PromiseCancellable';

describe(PromiseCancellable.name, () => {
  test('cancel promise', async () => {
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
    await expect(pC).rejects.toBe('cancellation');
    expect(timeout).toBeUndefined();
  });
});
