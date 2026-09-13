import type { Deck } from "./lib";
// Canonical paths encode the tree itself, so recursive parent relationships cannot exist.
export const folderParent = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const folderName = (path: string) => path.split("/").at(-1) || "Library";
export function folderPath(path: string) {
  if (!path) return "";
  const parts = path.split("/").map((s) => s.trim());
  if (
    parts.length > 32 ||
    parts.some((s) => !s || s === "." || s === ".." || s.length > 120) ||
    path.length > 2000
  )
    throw Error(
      "Use folder names up to 120 characters and at most 32 levels; no empty, . or .. segments.",
    );
  return parts.join("/");
}
export const folderContains = (parent: string, path: string) =>
  path === parent || path.startsWith(parent + "/");
export function allFolderPaths(decks: Deck[]) {
  const paths = new Set<string>();
  for (const d of decks) {
    if (d.meta?.deletedAt || !d.meta?.folder) continue;
    const parts = d.meta.folder.split("/");
    for (let i = 1; i <= parts.length; i++)
      paths.add(parts.slice(0, i).join("/"));
  }
  return [...paths];
}
export function relocatedPath(
  source: string,
  parent: string,
  name = folderName(source),
) {
  source = folderPath(source);
  parent = folderPath(parent);
  if (!source || folderContains(source, parent))
    throw Error(
      "A folder cannot be moved inside itself or one of its descendants.",
    );
  if (name.includes("/")) throw Error("A folder name cannot contain /.");
  return folderPath([parent, name.trim()].filter(Boolean).join("/"));
}
export function relocateFolder(
  decks: Deck[],
  source: string,
  parent: string,
  name?: string,
) {
  const destination = relocatedPath(source, parent, name);
  if (destination !== source && allFolderPaths(decks).includes(destination))
    throw Error("That destination already contains a folder with this name.");
  return decks
    .filter((d) => d.meta?.folder && folderContains(source, d.meta.folder))
    .map((d) => ({
      ...d,
      meta: {
        ...d.meta,
        folder: destination + d.meta!.folder!.slice(source.length),
      },
    }));
}
