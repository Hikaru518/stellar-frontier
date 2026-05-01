/**
 * Synchronous helper that turns a `Blob` into a browser file save.
 *
 * Implementation detail: we create a hidden `<a>`, set `href` from
 * `URL.createObjectURL`, append it to the document body so `click()` is
 * dispatched in a connected context, then immediately remove the element and
 * revoke the object URL. The DOM mutation is intentionally fully synchronous —
 * tests rely on that to assert post-conditions in the same tick.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Hidden but connected — some browsers ignore .click() on detached nodes.
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    // Always clean up, even if click() throws — leaving stale <a> nodes or
    // unreleased blob URLs is worse than swallowing a click exception here.
    if (anchor.parentNode != null) {
      anchor.parentNode.removeChild(anchor);
    }
    URL.revokeObjectURL(url);
  }
}
