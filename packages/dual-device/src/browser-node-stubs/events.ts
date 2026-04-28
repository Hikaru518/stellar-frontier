type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private listenersByEvent = new Map<string | symbol, Listener[]>();

  on(eventName: string | symbol, listener: Listener) {
    this.listenersByEvent.set(eventName, [...(this.listenersByEvent.get(eventName) ?? []), listener]);
    return this;
  }

  addListener(eventName: string | symbol, listener: Listener) {
    return this.on(eventName, listener);
  }

  once(eventName: string | symbol, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.off(eventName, wrapped);
      listener(...args);
    };
    return this.on(eventName, wrapped);
  }

  off(eventName: string | symbol, listener: Listener) {
    return this.removeListener(eventName, listener);
  }

  removeListener(eventName: string | symbol, listener: Listener) {
    this.listenersByEvent.set(
      eventName,
      (this.listenersByEvent.get(eventName) ?? []).filter((candidate) => candidate !== listener),
    );
    return this;
  }

  removeAllListeners(eventName?: string | symbol) {
    if (eventName === undefined) {
      this.listenersByEvent.clear();
    } else {
      this.listenersByEvent.delete(eventName);
    }
    return this;
  }

  listeners(eventName: string | symbol) {
    return [...(this.listenersByEvent.get(eventName) ?? [])];
  }

  emit(eventName: string | symbol, ...args: unknown[]) {
    for (const listener of this.listeners(eventName)) {
      listener(...args);
    }
    return this.listenersByEvent.has(eventName);
  }
}

export default { EventEmitter };
