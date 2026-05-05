export function parseJsonPointer(path: string | null | undefined): string[] {
  if (!path) {
    return [];
  }

  if (!path.startsWith("/")) {
    return splitLoosePath(path);
  }

  return path
    .slice(1)
    .split("/")
    .map((segment) => decodeJsonPointerSegment(segment));
}

export function joinJsonPointer(segments: readonly string[]): string {
  if (segments.length === 0) {
    return "";
  }

  return `/${segments.map((segment) => encodeJsonPointerSegment(segment)).join("/")}`;
}

export function encodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function formatJsonPathForDisplay(path: string | null | undefined): string {
  if (!path) {
    return "(no path)";
  }

  const segments = parseJsonPointer(path);
  if (segments.length === 0) {
    return path;
  }

  return path.startsWith("/") ? joinJsonPointer(segments) : segments.join(".");
}

export function getJsonPathLeaf(path: string | null | undefined): string | null {
  const segments = parseJsonPointer(path);
  return segments.length > 0 ? segments[segments.length - 1] : null;
}

function splitLoosePath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}
