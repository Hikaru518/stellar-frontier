export const join = (...parts: string[]) => parts.filter(Boolean).join("/");
export const resolve = (...parts: string[]) => join(...parts);
export const dirname = (path: string) => path.split("/").slice(0, -1).join("/") || ".";
export const basename = (path: string) => path.split("/").pop() ?? path;
export const extname = (path: string) => {
  const base = basename(path);
  const index = base.lastIndexOf(".");
  return index > 0 ? base.slice(index) : "";
};

export default { join, resolve, dirname, basename, extname };
