import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Copy,
  Download,
  Edit3,
  FolderInput,
  Grid2X2,
  List,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
  Undo2,
  Plus,
  ArrowUpRight,
  FolderOpen,
} from "lucide-react";
import { Deck } from "./lib";
import { exportDeckText } from "./native";
import { SetCover } from "./covers";
import { Modal } from "./ui";
import { Progress, notify } from "./motion";
export type SetActions = {
  update: (deck: Deck) => Promise<void>;
  duplicate: (deck: Deck) => Promise<void>;
  export: (deck: Deck) => Promise<void>;
  edit: (deck: Deck) => void;
  afterDelete?: () => void;
};
export const activeSet = (deck: Deck) =>
  !deck.meta?.deletedAt && !deck.meta?.archived;
export function lastStudied(deck: Deck) {
  const stamp =
    deck.lastStudied ||
    deck.cards
      .map((c) => c.lastReviewed || "")
      .sort()
      .at(-1);
  if (!stamp) return "Not studied yet";
  const date = new Date(stamp);
  return Number.isNaN(+date)
    ? "Not studied yet"
    : "Studied " +
        date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function DeckMenu({
  deck,
  actions,
}: {
  deck: Deck;
  actions: SetActions;
}) {
  const [modal, setModal] = useState<"delete" | "folder" | null>(null),
    [folder, setFolder] = useState(deck.meta?.folder || ""),
    [busy, setBusy] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (details.current && !details.current.contains(event.target as Node))
        details.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const run = async (job: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    if (details.current) details.current.open = false;
    try {
      await job();
    } catch {
      notify("Could not save this change. Please try again.", "error");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <details
        ref={details}
        className="deck-menu"
        onKeyDown={(e) => {
          if (e.key === "Escape" && details.current)
            details.current.open = false;
        }}
      >
        <summary aria-label={"More actions for " + deck.title}>
          <MoreHorizontal size={19} />
        </summary>
        <div className="menu-popover">
          <button
            onClick={() => {
              if (details.current) details.current.open = false;
              actions.edit(deck);
            }}
          >
            <Edit3 />
            Edit set
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(() => actions.update({ ...deck, favorite: !deck.favorite }))
            }
          >
            <Star />
            {deck.favorite ? "Unfavorite" : "Favorite"}
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => actions.duplicate(deck))}
          >
            <Copy />
            Duplicate
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => actions.export(deck))}
          >
            <Download />
            Export .flint set
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => exportDeckText(deck))}
          >
            <Download />
            Export text
          </button>
          <button
            onClick={() => {
              if (details.current) details.current.open = false;
              setModal("folder");
            }}
          >
            <FolderInput />
            Move to folder
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(() =>
                actions.update({
                  ...deck,
                  meta: { ...deck.meta, archived: !deck.meta?.archived },
                }),
              )
            }
          >
            <Archive />
            {deck.meta?.archived ? "Unarchive" : "Archive"}
          </button>
          <button
            className="danger-text"
            onClick={() => {
              if (details.current) details.current.open = false;
              setModal("delete");
            }}
          >
            <Trash2 />
            Delete set
          </button>
        </div>
      </details>
      {modal === "delete" && (
        <Modal
          title={"Delete “" + deck.title + "”?"}
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="delete-symbol">
            <Trash2 size={30} />
          </div>
          <p>
            This will move this set and its {deck.cards.length} cards to Trash.
            Study history and images are kept. You can restore it from Library →
            Trash.
          </p>
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="destructive"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await actions.update({
                    ...deck,
                    meta: { ...deck.meta, deletedAt: new Date().toISOString() },
                  });
                  setModal(null);
                  actions.afterDelete?.();
                  notify(deck.title + " moved to Trash", "success", () => {
                    void actions
                      .update({
                        ...deck,
                        meta: { ...deck.meta, deletedAt: null },
                      })
                      .then(() => notify("Set restored"))
                      .catch(() => notify("Could not restore set", "error"));
                  });
                })
              }
            >
              {busy ? "Moving…" : "Delete set"}
            </button>
          </div>
        </Modal>
      )}
      {modal === "folder" && (
        <Modal title="Move to folder" onClose={() => setModal(null)}>
          <label>
            Folder name
            <input
              autoFocus
              value={folder}
              placeholder="e.g. Semester one"
              onChange={(e) => setFolder(e.target.value)}
            />
          </label>
          <p>Leave blank to remove the set from its folder.</p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await actions.update({
                  ...deck,
                  meta: { ...deck.meta, folder: folder.trim() },
                });
                setModal(null);
              })
            }
          >
            Move set
          </button>
        </Modal>
      )}
    </>
  );
}
export function RichDeckCard({
  deck,
  start,
  actions,
}: {
  deck: Deck;
  start: (deck: Deck) => void;
  actions?: SetActions;
}) {
  const mastered = deck.cards.filter((c) => c.status === "Mastered").length;
  const studied = deck.cards.some((c) => (c.repetitions || 0) > 0);
  return (
    <article className="rich-deck">
      <button
        className="deck-art-button"
        aria-label={"Open " + deck.title}
        onClick={() => start(deck)}
      >
        <SetCover deck={deck} />
      </button>
      <div className="rich-deck-body">
        <div className="rich-deck-top">
          <h3>
            <button onClick={() => start(deck)}>{deck.title}</button>
          </h3>
          {actions && <DeckMenu deck={deck} actions={actions} />}
        </div>
        <p>
          {deck.cards.length} cards ·{" "}
          {deck.meta?.folder || deck.subject || "General"}
        </p>
        <small>{lastStudied(deck)}</small>
        {studied && (
          <Progress
            value={deck.cards.length ? (mastered / deck.cards.length) * 100 : 0}
            label={deck.title + " mastery"}
          />
        )}
        <div className="rich-deck-bottom">
          {actions && (
            <button
              className={"icon favorite " + (deck.favorite ? "selected" : "")}
              aria-label={
                (deck.favorite ? "Unfavorite " : "Favorite ") + deck.title
              }
              aria-pressed={!!deck.favorite}
              onClick={() =>
                actions
                  .update({ ...deck, favorite: !deck.favorite })
                  .catch(() => notify("Could not save favorite", "error"))
              }
            >
              <Star size={16} fill={deck.favorite ? "currentColor" : "none"} />
            </button>
          )}
          <span className="button-row">
            {actions && (
              <button
                className="text-button"
                onClick={() => actions.edit(deck)}
              >
                Edit
              </button>
            )}
            <button className="text-button" onClick={() => start(deck)}>
              Study <ArrowUpRight size={15} />
            </button>
          </span>
        </div>
      </div>
    </article>
  );
}
export function LibraryView({
  decks,
  start,
  actions,
  create,
  globalQuery,
}: {
  decks: Deck[];
  start: (deck: Deck) => void;
  actions: SetActions;
  create: () => void;
  globalQuery: string;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All"),
    [sort, setSort] = useState("studied"),
    [view, setView] = useState("grid"),
    [folder, setFolder] = useState("");
  const needle = query.trim().toLocaleLowerCase(),
    global = globalQuery.trim().toLocaleLowerCase();
  const folders = [
    ...new Set(
      decks
        .filter(activeSet)
        .map((d) => d.meta?.folder)
        .filter(Boolean),
    ),
  ] as string[];
  const shown = decks
    .filter((d) =>
      filter === "Trash"
        ? !!d.meta?.deletedAt
        : filter === "Archived"
          ? !d.meta?.deletedAt && d.meta?.archived
          : activeSet(d),
    )
    .filter((d) =>
      [d.title, d.subject, d.meta?.folder, ...(d.meta?.tags || [])]
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    )
    .filter(
      (d) =>
        !global ||
        [
          d.title,
          d.subject,
          d.meta?.folder,
          ...(d.meta?.tags || []),
          ...d.cards.flatMap((c) => [c.question, c.answer]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(global),
    )
    .filter((d) =>
      filter === "Favorites"
        ? d.favorite
        : filter === "Due"
          ? d.cards.some((c) => !c.dueAt || new Date(c.dueAt) <= new Date())
          : filter === "Recent"
            ? !!(d.lastStudied || d.cards.some((c) => c.lastReviewed))
            : filter === "Folders"
              ? !!d.meta?.folder && (!folder || d.meta.folder === folder)
              : true,
    )
    .sort((a, b) =>
      sort === "name"
        ? a.title.localeCompare(b.title)
        : sort === "cards"
          ? b.cards.length - a.cards.length
          : sort === "created"
            ? (b.createdAt || "").localeCompare(a.createdAt || "")
            : (
                b.lastStudied ||
                b.cards
                  .map((c) => c.lastReviewed || "")
                  .sort()
                  .at(-1) ||
                ""
              ).localeCompare(
                a.lastStudied ||
                  a.cards
                    .map((c) => c.lastReviewed || "")
                    .sort()
                    .at(-1) ||
                  "",
              ),
    );
  return (
    <div className="library-view">
      <div className="page-title">
        <div>
          <p className="eyebrow">YOUR KNOWLEDGE, GROWING</p>
          <h1>Your Library</h1>
          <p>Make room for your next discovery.</p>
        </div>
        <button className="primary" onClick={create}>
          <Plus size={17} />
          New set
        </button>
      </div>
      <label className="library-search">
        <Search size={20} />
        <input
          aria-label="Search your sets"
          placeholder="Search your sets..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="text-button" onClick={() => setQuery("")}>
            Clear
          </button>
        )}
      </label>
      <div className="library-controls">
        <div className="filter-tabs">
          {[
            "All",
            "Recent",
            "Favorites",
            "Due",
            "Folders",
            "Archived",
            "Trash",
          ].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={filter === f ? "selected" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="button-row">
          <select
            aria-label="Sort sets"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="studied">Recently studied</option>
            <option value="created">Recently created</option>
            <option value="name">Name</option>
            <option value="cards">Most cards</option>
          </select>
          <button
            className="icon"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className="icon"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      {filter === "Folders" && (
        <label className="folder-filter">
          <FolderOpen size={17} />
          <select
            aria-label="Filter folder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            <option value="">All folders</option>
            {folders.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      )}
      <p className="result-count" role="status">
        {shown.length} {shown.length === 1 ? "set" : "sets"}
        {global && " · Global search: " + globalQuery}
      </p>
      <div className={"rich-deck-grid " + (view === "list" ? "list-view" : "")}>
        {shown.map((d) =>
          filter === "Trash" ? (
            <article key={d.id} className="trash-row">
              <SetCover deck={d} />
              <div>
                <h3>{d.title}</h3>
                <p>{d.cards.length} cards · In Trash</p>
              </div>
              <button
                className="secondary"
                onClick={() =>
                  actions
                    .update({ ...d, meta: { ...d.meta, deletedAt: null } })
                    .then(() => notify("Set restored"))
                    .catch(() => notify("Could not restore set", "error"))
                }
              >
                <Undo2 size={16} />
                Restore
              </button>
            </article>
          ) : (
            <RichDeckCard key={d.id} deck={d} start={start} actions={actions} />
          ),
        )}
      </div>
      {!shown.length && (
        <div className="library-empty">
          <Search size={32} />
          <h2>{query || global ? "No matching sets" : "Nothing here yet"}</h2>
          <p>
            {filter === "Trash"
              ? "Deleted sets can be restored here."
              : "Try another filter, or create something worth learning."}
          </p>
        </div>
      )}
    </div>
  );
}
