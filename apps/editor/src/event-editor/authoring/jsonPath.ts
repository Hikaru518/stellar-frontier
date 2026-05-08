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

  if (path.startsWith("$.")) {
    return parseJsonPointer(path.slice(2)).join(".");
  }

  const segments = parseJsonPointer(path);
  if (segments.length === 0) {
    return path;
  }

  return path.startsWith("/") ? joinJsonPointer(segments) : segments.join(".");
}

export function normalizeJsonPathToPointer(path: string | null | undefined): string {
  if (!path) {
    return "";
  }

  const normalizedPath = path.startsWith("$.") ? path.slice(2) : path;
  return joinJsonPointer(parseJsonPointer(normalizedPath));
}

export function isJsonPathWithin(path: string | null | undefined, parentPath: string): boolean {
  const normalizedPath = normalizeJsonPathToPointer(path);
  const normalizedParent = normalizeJsonPathToPointer(parentPath);

  if (!normalizedParent) {
    return Boolean(normalizedPath);
  }

  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`);
}

export function mapIssueJsonPathToDraftPath(path: string | null | undefined): string {
  const normalizedPath = normalizeJsonPathToPointer(path);
  const segments = parseJsonPointer(normalizedPath);

  if (segments[0] === "event_definitions") {
    return joinJsonPointer(["working_definition", ...segments.slice(2)]);
  }

  if (segments[0] === "call_templates") {
    return joinJsonPointer(["working_call_templates", ...segments.slice(1)]);
  }

  return normalizedPath;
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
