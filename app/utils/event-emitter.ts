type Handler = (...args: unknown[]) => void;

export class EventEmitter {
  private readonly listeners = new Map<string | symbol, Handler[]>();

  on(event: string | symbol, handler: Handler): this {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
    return this;
  }

  addListener(event: string | symbol, handler: Handler): this {
    return this.on(event, handler);
  }

  once(event: string | symbol, handler: Handler): this {
    const wrapped: Handler = (...args) => {
      this.off(event, wrapped);
      handler(...args);
    };

    return this.on(event, wrapped);
  }

  off(event: string | symbol, handler: Handler): this {
    const handlers = this.listeners.get(event);

    if (!handlers) {
      return this;
    }

    this.listeners.set(
      event,
      handlers.filter((candidate) => candidate !== handler),
    );

    return this;
  }

  removeListener(event: string | symbol, handler: Handler): this {
    return this.off(event, handler);
  }

  emit(event: string | symbol, ...args: unknown[]): boolean {
    const handlers = [...(this.listeners.get(event) ?? [])];

    for (const handler of handlers) {
      handler(...args);
    }

    return handlers.length > 0;
  }

  removeAllListeners(event?: string | symbol): this {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }

    return this;
  }
}

export default EventEmitter;
