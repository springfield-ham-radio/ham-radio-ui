const pathCloseInflight = new Map<string, Promise<void>>();

/**
 * Track an in-flight close for a serial path so the next open can wait for it.
 * Multiple closes on the same path are chained; the waiter does not proceed until
 * every close that started has settled.
 */
export function trackSerialPathClose(path: string, promise: Promise<void>): void {
  const prior = pathCloseInflight.get(path);
  const combined = (prior ? prior.catch(() => undefined).then(() => promise) : promise).catch(
    () => undefined,
  );
  pathCloseInflight.set(path, combined);
  void combined.finally(() => {
    if (pathCloseInflight.get(path) === combined) {
      pathCloseInflight.delete(path);
    }
  });
}

/** Wait until any registered close for this path finishes. */
export async function waitForSerialPathClose(path: string): Promise<void> {
  await pathCloseInflight.get(path);
}

/** @internal Test helper */
export function resetSerialPathCloseTracking(): void {
  pathCloseInflight.clear();
}
