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
import { moveFolder } from "./editing";
export type SetActions = {
  remove?: (id: string) => Promise<void>;
  batch?: (decks: Deck[]) => Promise<void>;
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
            Trash. Items expire after 7 days. Trash holds at most 5 sets; adding
            another permanently removes the oldest set and its unshared media.
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
  const [dragged, setDragged] = useState<string | null>(null),
    [over, setOver] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [proposal, setProposal] = useState<{
      kind: "create" | "rename" | "delete" | "permanent";
      ids: string[];
      old?: string;
    } | null>(null),
    [name, setName] = useState("");
  const matches = (d: Deck) =>
    [query, globalQuery].every(
      (q) =>
        !q.trim() ||
        [
          d.title,
          d.subject,
          d.meta?.folder,
          ...(d.meta?.tags || []),
          ...d.cards.flatMap((c) => [c.question, c.answer]),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(q.trim().toLocaleLowerCase()),
    );
  const candidates = decks
    .filter((d) =>
      filter === "Trash"
        ? !!d.meta?.deletedAt
        : filter === "Archived"
          ? !d.meta?.deletedAt && d.meta?.archived
          : activeSet(d),
    )
    .filter((d) =>
      filter === "Favorites"
        ? d.favorite
        : filter === "Recent"
          ? !!(d.lastStudied || d.cards.some((c) => c.lastReviewed))
          : true,
    )
    .filter(matches);
  const folders =
    folder || filter === "Trash"
      ? []
      : ([
          ...new Set(candidates.map((d) => d.meta?.folder).filter(Boolean)),
        ] as string[]);
  const shown = candidates
    .filter(
      (d) =>
        filter === "Trash" ||
        (folder ? d.meta?.folder === folder : !d.meta?.folder),
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
  const batch = async (changes: Deck[]) => {
    if (actions.batch) await actions.batch(changes);
    else for (const deck of changes) await actions.update(deck);
  };
  const editFolder = (kind: "rename" | "delete", old: string) => {
    setError("");
    setName(old);
    setProposal({
      kind,
      old,
      ids: decks
        .filter((d) => !d.meta?.deletedAt && d.meta?.folder === old)
        .map((d) => d.id),
    });
  };
  const dropInto = async (target: string) => {
    const id = dragged;
    setDragged(null);
    setOver("");
    if (!id) return;
    try {
      await batch(
        moveFolder(
          decks.filter((d) => d.id === id),
          [id],
          target,
        ),
      );
      notify(target ? "Moved to " + target : "Moved to Library");
    } catch {
      notify("Could not move set", "error");
    }
  };
  const confirm = async () => {
    if (!proposal || busy) return;
    setBusy(true);
    setError("");
    try {
      const members = decks.filter((d) => proposal.ids.includes(d.id));
      if (proposal.kind === "permanent") {
        if (!actions.remove) throw Error("Permanent removal is unavailable");
        await actions.remove(proposal.ids[0]);
        notify("Set permanently removed");
      } else if (proposal.kind === "delete") {
        await batch(
          members.map((d) => ({
            ...d,
            meta: { ...d.meta, deletedAt: new Date().toISOString() },
          })),
        );
        setFolder("");
      } else {
        const next = name.trim();
        if (!next) throw Error("Enter a folder name");
        if (
          decks.some(
            (d) =>
              !d.meta?.deletedAt &&
              d.meta?.folder === next &&
              next !== proposal.old,
          )
        )
          throw Error("That folder already exists. Choose another name.");
        await batch(moveFolder(members, proposal.ids, next));
        if (proposal.kind === "rename" && folder === proposal.old)
          setFolder(next);
      }
      setProposal(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="library-view">
      {proposal && (
        <Modal
          title={
            proposal.kind === "permanent"
              ? "Permanently remove this set?"
              : proposal.kind === "delete"
                ? "Delete folder “" + proposal.old + "”?"
                : proposal.kind === "rename"
                  ? "Rename folder"
                  : "Create folder"
          }
          onClose={() => {
            if (!busy) setProposal(null);
          }}
        >
          {proposal.kind === "permanent" ? (
            <p>
              This permanently deletes the set, its cards, history and unshared
              media. This cannot be undone.
            </p>
          ) : proposal.kind === "delete" ? (
            <p>
              All {proposal.ids.length} sets in this folder will move to Trash,
              including archived sets. Each set is one Trash item. Trash keeps
              at most 5 sets for 7 days; excess oldest sets are permanently
              deleted. The folder disappears when empty and returns when a
              member is restored.
            </p>
          ) : (
            <label>
              Folder name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setProposal(null)}
            >
              Cancel
            </button>
            <button
              className={
                proposal.kind === "delete" || proposal.kind === "permanent"
                  ? "destructive"
                  : "primary"
              }
              disabled={
                busy ||
                ((proposal.kind === "create" || proposal.kind === "rename") &&
                  !name.trim())
              }
              onClick={() => void confirm()}
            >
              {proposal.kind === "permanent"
                ? "Permanently remove"
                : proposal.kind === "delete"
                  ? "Delete folder and move sets to Trash"
                  : proposal.kind === "rename"
                    ? "Rename folder"
                    : "Create folder"}
            </button>
          </div>
        </Modal>
      )}
      <div className="page-title">
        <div>
          {folder && (
            <button
              className={
                "text-button " + (over === "root" ? "drop-target" : "")
              }
              onClick={() => setFolder("")}
              onDragOver={(e) => {
                if (dragged) {
                  e.preventDefault();
                  setOver("root");
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                void dropInto("");
              }}
            >
              ← Library
            </button>
          )}
          <p className="eyebrow">{folder ? "FOLDER" : "YOUR COLLECTION"}</p>
          <h1>{folder || "Your Library"}</h1>
          <p>
            {folder
              ? "A little knowledge, kept together."
              : "All your sets. A place for every idea."}
          </p>
        </div>
        <div className="button-row">
          {folder && (
            <>
              <button
                className="secondary"
                aria-label={"Rename folder " + folder}
                onClick={() => editFolder("rename", folder)}
              >
                Rename
              </button>
              <button
                className="icon"
                aria-label={"Delete folder " + folder}
                onClick={() => editFolder("delete", folder)}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
          <button className="primary" onClick={create}>
            <Plus size={17} />
            New set
          </button>
        </div>
      </div>
      <label className="library-search">
        <Search size={20} />
        <input
          aria-label="Search your sets"
          placeholder={
            folder ? "Search this folder…" : "Search sets and folders…"
          }
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
          {["All", "Recent", "Favorites", "Archived", "Trash"].map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              className={filter === f ? "selected" : ""}
              onClick={() => {
                setFilter(f);
                setFolder("");
              }}
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
      <p className="result-count" role="status">
        {folders.length ? folders.length + " folders · " : ""}
        {shown.length} sets
        {filter === "Trash" ? " · Up to 7 days, 5 sets maximum" : ""}
      </p>
      <div className={"rich-deck-grid " + (view === "list" ? "list-view" : "")}>
        {folders
          .sort((a, b) => a.localeCompare(b))
          .map((f) => (
            <article
              key={"folder:" + f}
              className={"folder-card " + (over === f ? "drop-target" : "")}
              onDragOver={(e) => {
                if (dragged) {
                  e.preventDefault();
                  setOver(f);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                void dropInto(f);
              }}
            >
              <button
                className="folder-open"
                aria-label={"Open folder " + f}
                onClick={() => setFolder(f)}
              >
                <FolderOpen size={44} />
                <h3>{f}</h3>
                <p>
                  {
                    decks.filter(
                      (d) => !d.meta?.deletedAt && d.meta?.folder === f,
                    ).length
                  }{" "}
                  sets
                </p>
              </button>
              <details className="deck-menu">
                <summary aria-label={"Actions for folder " + f}>
                  <MoreHorizontal size={19} />
                </summary>
                <div className="menu-popover">
                  <button
                    aria-label={"Rename folder " + f}
                    onClick={() => editFolder("rename", f)}
                  >
                    <Edit3 />
                    Rename
                  </button>
                  <button
                    aria-label={"Delete folder " + f}
                    onClick={() => editFolder("delete", f)}
                  >
                    <Trash2 />
                    Delete folder
                  </button>
                </div>
              </details>
            </article>
          ))}
        {shown.map((d) =>
          filter === "Trash" ? (
            <article key={d.id} className="trash-row">
              <SetCover deck={d} />
              <div>
                <h3>{d.title}</h3>
                <p>
                  {d.cards.length} cards · Deleted{" "}
                  {new Date(d.meta!.deletedAt!).toLocaleDateString()} ·{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      (Date.parse(d.meta!.deletedAt!) +
                        7 * 86400000 -
                        Date.now()) /
                        86400000,
                    ),
                  )}{" "}
                  days left
                </p>
              </div>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() =>
                    void actions
                      .update({ ...d, meta: { ...d.meta, deletedAt: null } })
                      .then(() => notify("Set restored"))
                      .catch(() => notify("Could not restore set", "error"))
                  }
                >
                  <Undo2 size={16} />
                  Restore
                </button>
                <button
                  className="text-button danger-text"
                  onClick={() => {
                    setError("");
                    setProposal({ kind: "permanent", ids: [d.id] });
                  }}
                >
                  Permanently remove
                </button>
              </div>
            </article>
          ) : (
            <div
              key={d.id}
              className={
                "deck-drop-wrap " + (over === d.id ? "drop-target" : "")
              }
              draggable
              title="Drag onto a set to create a folder, or use Move to folder in the menu."
              onDragStart={(e) => {
                if ((e.target as Element).closest(".deck-menu,input,select")) {
                  e.preventDefault();
                  return;
                }
                setDragged(d.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", d.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setOver("");
              }}
              onDragOver={(e) => {
                if (dragged && dragged !== d.id) {
                  e.preventDefault();
                  setOver(d.id);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged && dragged !== d.id) {
                  setError("");
                  setName("New folder");
                  setProposal({ kind: "create", ids: [dragged, d.id] });
                }
                setDragged(null);
                setOver("");
              }}
            >
              <RichDeckCard deck={d} start={start} actions={actions} />
              {over === d.id && (
                <small className="folder-drop-hint">
                  Create a folder together
                </small>
              )}
            </div>
          ),
        )}
      </div>
      {!shown.length && !folders.length && (
        <div className="library-empty">
          <Search size={32} />
          <h2>
            {query || globalQuery ? "No matching sets" : "Nothing here yet"}
          </h2>
          <p>
            {filter === "Trash"
              ? "Deleted sets appear here until restored or permanently removed."
              : folder
                ? "Move sets here from their menu or drop them onto this folder."
                : "Create a set to begin."}
          </p>
        </div>
      )}
    </div>
  );
}
