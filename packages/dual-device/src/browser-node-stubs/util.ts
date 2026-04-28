export const debuglog = () => () => undefined;
export const inspect = (value: unknown) => String(value);
export const inherits = (constructor: unknown, superConstructor: unknown) => {
  if (typeof constructor === "function" && typeof superConstructor === "function") {
    Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
  }
};

export default { debuglog, inspect, inherits };
