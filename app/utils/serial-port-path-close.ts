const pathCloseInflight = new Map<string, Promise<void>>();

/**
 * Track an in-flight close for a serial path so the next open can wait for it.
 */
export function trackSerialPathClose(path: string, promise: Promise<void>): void {
  pathCloseInflight.set(path, promise);
  void promise.finally(() => {
    if (pathCloseInflight.get(path) === promise) {
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
