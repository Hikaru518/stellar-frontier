const browserCrypto = globalThis.crypto;

export default browserCrypto;
export const webcrypto = browserCrypto;
export const subtle = browserCrypto?.subtle;
export const getRandomValues = browserCrypto?.getRandomValues?.bind(browserCrypto);
export const randomBytes = (size: number) => {
  const bytes = new Uint8Array(size);
  browserCrypto?.getRandomValues(bytes);
  return bytes;
};
