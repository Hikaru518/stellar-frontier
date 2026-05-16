export const DEFAULT_YUAN_HOST_URL = "ws://8.159.128.125:8888/";

export function resolveConfiguredYuanHostUrl(configured?: string) {
  return configured || DEFAULT_YUAN_HOST_URL;
}
