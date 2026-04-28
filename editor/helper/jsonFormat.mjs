export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
