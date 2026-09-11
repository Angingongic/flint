import type { Deck } from "./lib";
export type LibraryPreferences = {
  order: string[];
  folders: Record<string, { pinned?: boolean; color?: string }>;
  sort: string;
};
const key = "flint-library-layout-v1";
export function loadLibraryPreferences(): LibraryPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (
      value &&
      Array.isArray(value.order) &&
      value.folders &&
      typeof value.folders === "object"
    )
      return value;
  } catch {
    /* Preserve usability if browser storage is unavailable. */
  }
  return { order: [], folders: {}, sort: "studied" };
}
export function saveLibraryPreferences(value: LibraryPreferences) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function reorderItems(
  ids: string[],
  source: string,
  target: string,
  after: boolean,
) {
  if (source === target || !ids.includes(source) || !ids.includes(target))
    return ids;
  const result = ids.filter((id) => id !== source);
  result.splice(result.indexOf(target) + Number(after), 0, source);
  return result;
}
export function orderedSets(decks: Deck[], order: string[]) {
  const rank = (id: string) => {
    const n = order.indexOf(id);
    return n < 0 ? Number.MAX_SAFE_INTEGER : n;
  };
  return [...decks].sort((a, b) => rank(a.id) - rank(b.id));
}
