import path from "node:path";

export function createPathGuard(repoRoot, allowedDirectories) {
  const root = path.resolve(repoRoot);
  const allowedRoots = allowedDirectories.map((directory) => path.resolve(root, directory));

  return {
    resolveAllowedPath(relativePath) {
      if (typeof relativePath !== "string" || relativePath.length === 0) {
        throw new Error("Path must be a non-empty repository-relative string.");
      }

      if (path.isAbsolute(relativePath)) {
        throw new Error(`Path is outside repository root: ${relativePath}`);
      }

      const resolved = path.resolve(root, relativePath);
      if (!isInsideOrEqual(resolved, root)) {
        throw new Error(`Path is outside repository root: ${relativePath}`);
      }

      if (!allowedRoots.some((allowedRoot) => isInsideOrEqual(resolved, allowedRoot))) {
        throw new Error(`Path is not in an allowed directory: ${relativePath}`);
      }

      return resolved;
    },
  };
}

function isInsideOrEqual(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
