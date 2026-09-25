import { SmartMathTextarea } from "./SmartMathField";
import { AccessibilityPreferences, EditorPreferences, StudyPreferences } from "./EditorPreferences";
import { usePreference, writePreference } from "./preferences";
import { Welcome20 } from "./Welcome20";
import { mathSuggestion } from "./math-autofill";
import { StructuredEditor } from "./StructuredEditor";
import { restoreLegacyLibrary } from "./lib";
import type { StructuredCard } from "./structured";
import { relocateFolder, folderName } from "./folders";
import { relocateLibraryFolder } from "./native";
import { VideoField } from "./Video";
import {
  ImageField,
  ManagedImage,
  CoverEditor,
  ImageDestination,
  useImageDragFeedback,
} from "./ImageField";
import { InsertMedia } from "./InsertMedia";
import { swapSides } from "./editing";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnswerInput, CanonicalAnswer } from "./AnswerInput";
import { gradeAnswer, ignoreAccents } from "./lib";
import { MotionPage, Toasts, notify, motion, useReducedMotion } from "./motion";
import { SetOverview, Flashcards, WaveLearn, WorksheetTest } from "./Study";
import {
  CoverPicker,
  normalizeCover,
  presetFor,
  SetCover,
  freshCover,
} from "./covers";
import {
  LibraryView,
  RichDeckCard,
  activeSet,
  lastStudied,
  SetActions,
} from "./LibraryView";
import {
  updateDeckDetails,
  updateDeckBatch,
  pruneTrash,
  exportFlint,
  permanentlyRemoveDeck,
} from "./native";
import {
  editableTarget,
  useUndoState,
  resolveDuplicates,
  resolvedStars,
  type DuplicateChoice,
} from "./editing";
import { DuplicateReview, duplicateCandidates } from "./DuplicateReview";
import { PortableSets } from "./PortableSet";
import { Commands, ShortcutHelp, modifierLabel } from "./Commands";
import { ImageCrop } from "./ImageCrop";
import { AudioField, AudioPlayer } from "./Audio";
import { type WaveState, learnComplete } from "./learn-engine";
import {
  Home,
  Library,
  GraduationCap,
  Download,
  Plus,
  BarChart3,
  Settings,
  Search,
  Flame,
  Clock3,
  Target,
  ArrowRight,
  ChevronDown,
  MoreHorizontal,
  Star,
  Folder,
  Play,
  Check,
  RotateCcw,
  X,
  Sun,
  Moon,
  Upload,
  BookOpen,
  Keyboard,
  ShieldCheck,
} from "lucide-react";
import {
  Deck,
  parseCardsDetailed,
  uid,
  checkAnswer,
  newCard,
  dueCards,
  canCreateDeck,
  isValidCardDraft,
  cardIssues,
} from "./lib";
import {
  loadNativeDecks,
  saveNativeDeck,
  reviewNative,
  extractDocument,
  createBackup,
  restoreBackup,
  inTauri,
  importMedia,
  saveMediaBytes,
  mediaUrl,
  saveStudySession,
  loadStudySession,
  recordTestAttempt,
} from "./native";
import { open, save } from "@tauri-apps/plugin-dialog";
import { UpdateProvider, UpdateSettings } from "./Updates";
import { StorageMaintenance } from "./StorageMaintenance";
import { Modal } from "./ui";
import { invoke } from "@tauri-apps/api/core";
import { syncDraftMedia } from "./native";
import { getVersion } from "@tauri-apps/api/app";
import { displayVersion } from "./version";
type Page =
  | "Home"
  | "Library"
  | "Study"
  | "Import"
  | "Create"
  | "Statistics"
  | "Settings";
type StudyMode =
  "learn" | "flashcards" | "typed" | "test" | "word" | "due" | "weak";
const nav = [
  ["Home", Home],
  ["Library", Library],
  ["Import", Download],
  ["Create", Plus],
  ["Statistics", BarChart3],
  ["Settings", Settings],
] as const;
const load = () => {
  try {
    const decks: Deck[] =
      JSON.parse(localStorage.getItem("flint-decks") || "null") || [];
    return decks
      .filter((deck) => !["bio", "history", "spanish"].includes(deck.id))
      .map(restoreLegacyLibrary).map(normalizeCover);
  } catch {
    return [];
  }
};
export function App() {
  const [studySize]=usePreference<number>("study-size",100),[highContrast]=usePreference<boolean>("high-contrast",false),[reducedMotion]=usePreference<boolean>("reduced-motion",false);
  useEffect(()=>{
    document.documentElement.style.setProperty("--study-text-scale",String(Math.max(100,Math.min(130,studySize))/100));
    document.documentElement.dataset.highContrast=String(highContrast);
    document.documentElement.dataset.reducedMotion=String(reducedMotion);
  },[studySize,highContrast,reducedMotion]);
  const [upgradedTo20,setUpgradedTo20]=useState(false);
  const [newSetFolder, setNewSetFolder] = useState<string | undefined>(
    undefined,
  );
  const [portableBusy, setPortableBusy] = useState(false);
  const [commands, setCommands] = useState(false),
    [shortcutHelp, setShortcutHelp] = useState(false);
  const [page, setPage] = useState<Page>("Home");
  const [decks, setDecks] = useState<Deck[]>(load);
  const [dark, setDarkState] = useState(
    localStorage.getItem("flint-theme") !== "light",
  );
  const [themeMode]=usePreference<string>("theme-mode","manual");
  const setDark=(next:boolean)=>{writePreference("theme-mode","manual");setDarkState(next);};
  useEffect(()=>{
    if(themeMode!=="system" || typeof matchMedia!=="function")return;
    const media=matchMedia("(prefers-color-scheme: dark)");const update=()=>setDarkState(media.matches);
    update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);
  },[themeMode]);
  const [studyDeck, setStudyDeck] = useState<Deck | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode | null>(null);
  const [practiceDeck, setPracticeDeck] = useState<Deck | null>(null);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("flint-display-name") || "",
  );
  const [appError, setAppError] = useState("");
  type Change = { undo: () => Promise<void>; redo: () => Promise<void> };
  const undoActions = useRef<Change[]>([]),
    redoActions = useRef<Change[]>([]),
    undoBusy = useRef(false);
  const recordUndo = (undo: Change["undo"], redo: Change["redo"]) => {
    undoActions.current.push({ undo, redo });
    if (undoActions.current.length > 100) undoActions.current.shift();
    redoActions.current = [];
  };
  const replayLibrary = async (redo = false) => {
    if (undoBusy.current) return;
    const from = redo ? redoActions : undoActions,
      to = redo ? undoActions : redoActions,
      action = from.current.pop();
    if (!action) return;
    undoBusy.current = true;
    try {
      await (redo ? action.redo() : action.undo());
      to.current.push(action);
      notify(redo ? "Change redone" : "Change undone");
    } catch {
      from.current.push(action);
      notify(
        "Could not restore this change; it may have expired from Trash",
        "error",
      );
    } finally {
      undoBusy.current = false;
    }
  };
  const undoLibrary = () => replayLibrary();
  const decksRef = useRef(decks);
  decksRef.current = decks;
  useEffect(() => {
    let active = true;
    const cleanup = async () => {
      try {
        const current = decksRef.current;
        const clean = await pruneTrash(current);
        if (active && clean.length !== current.length)
          setDecks((old) =>
            old.filter(
              (d) =>
                !current.some((c) => c.id === d.id) ||
                clean.some((c) => c.id === d.id),
            ),
          );
      } catch (error) {
        if (active) setAppError(String(error));
      }
    };
    const timer = setInterval(() => void cleanup(), 60000);
    void cleanup();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    loadNativeDecks()
      .then((native) => {
        if (native) {
          const previous=localStorage.getItem("flint-last-version");
          const upgraded=previous ? Number(previous.split(".")[0]) < 2 : native.length > 0;
          if(upgraded && localStorage.getItem("flint-welcome-2")!=="viewed")localStorage.setItem("flint-welcome-2-pending","true");
          setUpgradedTo20(localStorage.getItem("flint-welcome-2-pending")==="true");
          localStorage.setItem("flint-last-version","2.0.0");
          setDecks(native);
        }
      })
      .catch((error) =>
        setAppError(`Flint couldn't open your library: ${String(error)}`),
      );
  }, []);
  useEffect(
    () => localStorage.setItem("flint-decks", JSON.stringify(decks)),
    [decks],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("flint-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommands(true);
        return;
      }
      if (
        document.querySelector('dialog[open],[aria-modal="true"]') ||
        editableTarget(event.target)
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y")
      ) {
        event.preventDefault();
        void undoLibrary();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        setEditingDeck(null);
        go("Create");
      } else if (event.key === "/") {
        event.preventDefault();
        setCommands(true);
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutHelp(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (studyMode) setStudyMode(null);
        else go("Library");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [studyMode, studyDeck]);
  const go = (p: Page) => {
    window.location.hash = p;
    setPage(p);
    setStudyDeck(null);
    setPracticeDeck(null);
    setStudyMode(null);
  };
  const start = (d?: Deck, mode?: StudyMode) => {
    if (!d) {
      go("Library");
      return;
    }
    const hash = `#Study/${encodeURIComponent(d.id)}${mode ? "/" + mode : ""}`;
    if (window.location.hash !== hash)
      window.history.pushState({ modeEntry: !!mode }, "", hash);
    setStudyMode(mode || null);
    setStudyDeck(d);
    setPage("Study");
  };
  useEffect(() => {
    const restoreRoute = () => {
      const [route, id, mode] = window.location.hash.slice(1).split("/");
      if (route === "Study" && id) {
        const deck = decks.find(
          (d) => d.id === decodeURIComponent(id) && !d.meta?.deletedAt,
        );
        if (deck) {
          setStudyDeck(deck);
          setStudyMode(
            [
              "learn",
              "flashcards",
              "typed",
              "test",
              "word",
              "due",
              "weak",
            ].includes(mode)
              ? (mode as StudyMode)
              : null,
          );
          setPage("Study");
        } else {
          setPage("Library");
          setStudyDeck(null);
          setStudyMode(null);
        }
      } else if (nav.some(([label]) => label === route)) {
        setPage(route as Page);
        setStudyDeck(null);
        setStudyMode(null);
      } else if (route === "Study" || route === "Commands") {
        window.history.replaceState(null, "", "#Library");
        setPage("Library");
        setStudyDeck(null);
        setStudyMode(null);
      }
    };
    window.addEventListener("hashchange", restoreRoute);
    restoreRoute();
    window.addEventListener("popstate", restoreRoute);
    return () => {
      window.removeEventListener("hashchange", restoreRoute);
      window.removeEventListener("popstate", restoreRoute);
    };
  }, [decks]);
  const backToSet = () => {
    setPracticeDeck(null);
    if (studyDeck) {
      if (window.history.state?.modeEntry) {
        window.history.back();
        setStudyMode(null);
      } else start(studyDeck);
    }
    void loadNativeDecks()
      .then((native) => {
        if (native) setDecks(native);
      })
      .catch(() => setAppError("Could not refresh your study history."));
  };
  const focused = page === "Study" && !!studyDeck && !!studyMode;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        focused &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        backToSet();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focused, studyDeck]);
  const editSet = (deck: Deck) => {
    setEditingDeck(deck);
    go("Create");
  };
  const applyMetadata = async (changes: Deck[]) => {
    await updateDeckBatch(changes);
    const merge = (d: Deck) => {
      const c = changes.find((c) => c.id === d.id);
      return c
        ? { ...d, meta: c.meta, favorite: c.favorite, coverImage: c.coverImage }
        : d;
    };
    setDecks((old) => old.map(merge));
    setStudyDeck((old) => (old ? merge(old) : old));
  };
  const setActions: SetActions = {
    relocateFolder: async (source, parent, name) => {
      const previous = decksRef.current.filter(
        (d) =>
          d.meta?.folder === source || d.meta?.folder?.startsWith(source + "/"),
      );
      const changes = relocateFolder(decksRef.current, source, parent, name);
      await relocateLibraryFolder(source, parent, name || folderName(source));
      setDecks((old) =>
        old.map((d) => changes.find((c) => c.id === d.id) || d),
      );
      recordUndo(
        () => applyMetadata(previous),
        () => applyMetadata(changes),
      );
    },
    saveCard: async (deckId, card, starred) => {
      const current = decksRef.current.find((d) => d.id === deckId);
      const previous = current?.cards.find((c) => c.id === card.id);
      if (!current || !previous) throw Error("Card no longer exists");
      const apply = async (content: typeof card, star: boolean) => {
        const latest = decksRef.current.find((d) => d.id === deckId);
        if (!latest?.cards.some((c) => c.id === card.id))
          throw Error("Card no longer exists");
        const stars = (latest.meta?.starredCards || []).filter(
          (id) => id !== card.id,
        );
        const next = {
          ...latest,
          cards: latest.cards.map((c) =>
            c.id === card.id
              ? {
                  ...c,
                  question: content.question,
                  answer: content.answer,
                  questionImage: content.questionImage,
                  answerImage: content.answerImage,
                  questionAudio: content.questionAudio,
                  answerAudio: content.answerAudio,
                  questionVideo: content.questionVideo,
                  answerVideo: content.answerVideo,
                  structure: content.structure,
                }
              : c,
          ),
          meta: {
            ...latest.meta,
            starredCards: star ? [...stars, card.id] : stars,
          },
        };
        await saveNativeDeck(next);
        setDecks((old) => old.map((d) => (d.id === deckId ? next : d)));
        setStudyDeck((old) => (old?.id === deckId ? next : old));
      };
      await apply(card, starred);
      recordUndo(
        () => apply(previous, !!current.meta?.starredCards?.includes(card.id)),
        () => apply(card, starred),
      );
    },
    remove: async (id) => {
      if (!decksRef.current.find((d) => d.id === id)?.meta?.deletedAt)
        throw Error("Only trashed sets can be removed");
      await permanentlyRemoveDeck(id);
      setDecks((old) => old.filter((d) => d.id !== id));
    },
    edit: editSet,
    update: async (deck) => {
      const previous = decks.find((d) => d.id === deck.id);
      await updateDeckDetails(deck);
      if (previous)
        recordUndo(
          () => applyMetadata([previous]),
          () => applyMetadata([deck]),
        );
      const next = decks.map((d) =>
        d.id === deck.id
          ? {
              ...d,
              favorite: deck.favorite,
              coverImage: deck.coverImage,
              meta: deck.meta,
            }
          : d,
      );
      setDecks(await pruneTrash(next));
      if (studyDeck?.id === deck.id) setStudyDeck(deck);
    },
    batch: async (changes) => {
      const previous = decks.filter((d) => changes.some((c) => c.id === d.id));
      await updateDeckBatch(changes);
      setDecks(
        await pruneTrash(
          decks.map((d) => changes.find((c) => c.id === d.id) || d),
        ),
      );
      recordUndo(
        () => applyMetadata(previous),
        () => applyMetadata(changes),
      );
      notify("Library updated", "success", () => {
        void undoLibrary();
      });
    },
    duplicate: async (deck) => {
      const copy = normalizeCover({
        ...deck,
        id: uid(),
        title: deck.title + " — copy",
        createdAt: new Date().toISOString(),
        lastStudied: undefined,
        favorite: false,
        meta: {
          ...deck.meta,
          deletedAt: null,
          starredCards: [],
        },
        cards: deck.cards.map((c) => ({
          ...newCard(c.question, c.answer),
          questionImage: c.questionImage,
          answerImage: c.answerImage,
          questionAudio: c.questionAudio,
          answerAudio: c.answerAudio,
          questionVideo: c.questionVideo,
          answerVideo: c.answerVideo,
          structure: c.structure,
        })),
      });
      await saveNativeDeck(copy);
      setDecks((current) => [copy, ...current]);
      notify("Set duplicated");
    },
    export: exportFlint,
    afterDelete: () => go("Library"),
  };
  const visibleDecks = decks.filter(activeSet);
  return (
    <UpdateProvider
      blocked={
        portableBusy || page === "Create" || page === "Import" || !!studyMode
      }
    >
      {commands && (
        <Commands
          onClose={() => setCommands(false)}
          items={[
            {
              label: "New set",
              run: () => {
                setEditingDeck(null);
                go("Create");
              },
            },
            { label: "Library", run: () => go("Library") },
            { label: "Import cards", run: () => go("Import") },
            { label: "Settings", run: () => go("Settings") },
            { label: "Keyboard shortcuts", run: () => setShortcutHelp(true) },
            ...visibleDecks.map((d) => ({
              label: "Study: " + d.title,
              run: () => start(d),
            })),
          ]}
        />
      )}
      {shortcutHelp && <ShortcutHelp onClose={() => setShortcutHelp(false)} />}
      <Welcome20 upgraded={upgradedTo20 && !portableBusy}/>
      <PortableSets
        decks={decks}
        onBusy={setPortableBusy}
        onImported={(deck) => {
          setDecks((old) => [deck, ...old]);
          if (page !== "Create" && !studyMode) go("Library");
        }}
      />
      <div
        className={"shell " + (focused ? "focus-shell" : "")}
        style={
          focused && studyDeck
            ? ({
                "--set-accent": presetFor(studyDeck).accent,
              } as React.CSSProperties)
            : undefined
        }
      >
        {focused && studyDeck && (
          <div className="study-atmosphere" aria-hidden="true">
            <SetCover deck={studyDeck} />
          </div>
        )}
        <aside>
          <div className="brand">
            <Logo />
            <span>Flint</span>
          </div>
          <nav>
            {nav.map(([label, Icon]) => (
              <button
                key={label}
                aria-label={label}
                className={page === label ? "active" : ""}
                onClick={() => {
                  if (label === "Create") setEditingDeck(null);
                  go(label);
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
                {label === "Create" && (
                  <kbd aria-hidden="true">{modifierLabel()} N</kbd>
                )}
              </button>
            ))}
          </nav>
          <div className="side-bottom">
            <div className="profile">
              <span className="avatar">
                {(displayName.trim()[0] || "F").toUpperCase()}
              </span>
              <span>
                <b>{displayName || "Local profile"}</b>
                <small>
                  {displayName
                    ? "Stored on this device"
                    : "No account required"}
                </small>
              </span>
            </div>
          </div>
        </aside>
        <main>
          <header>
            <button className="icon" aria-label="Search Flint" title={`Search Flint (${modifierLabel()} K)`} onClick={()=>setCommands(true)}><Search size={18}/></button>
            <div className="header-actions">
              <button
                className="icon"
                aria-label={
                  dark ? "Switch to light theme" : "Switch to dark theme"
                }
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </header>
          <section className="content">
            <MotionPage
              route={`${page}-${studyDeck?.id || ""}-${studyMode || ""}`}
            >
              {appError && (
                <div className="hint danger" role="alert">
                  <X size={16} />
                  <span>{appError}</span>
                  <button onClick={() => setAppError("")}>Dismiss</button>
                </div>
              )}
              {page === "Home" && (
                <Dashboard decks={visibleDecks} start={start} go={go} />
              )}{" "}
              {page === "Library" && (
                <LibraryView
                  decks={decks}
                  start={start}
                  create={(folder) => {
                    setNewSetFolder(folder || "");
                    setEditingDeck(null);
                    go("Create");
                  }}
                  actions={setActions}
                />
              )}{" "}
              {page === "Study" &&
                (studyDeck ? (
                  studyMode === null ? (
                    <SetOverview
                      deck={studyDeck}
                      start={(mode) => start(studyDeck, mode)}
                      edit={() => {
                        setEditingDeck(studyDeck);
                        go("Create");
                      }}
                      actions={setActions}
                      back={() => go("Library")}
                    />
                  ) : studyMode === "flashcards" ? (
                    <Flashcards deck={studyDeck} done={backToSet} />
                  ) : studyMode === "learn" ? (
                    <WaveLearn
                      key={(practiceDeck || studyDeck).cards
                        .map((c) => c.id)
                        .join()}
                      deck={practiceDeck || studyDeck}
                      done={backToSet}
                    />
                  ) : studyMode === "test" ? (
                    <WorksheetTest
                      deck={studyDeck}
                      done={backToSet}
                      studyMissed={(subset) => {
                        setPracticeDeck(subset);
                        window.history.replaceState(
                          null,
                          "",
                          "#Study/" + encodeURIComponent(studyDeck.id),
                        );
                        start(studyDeck, "learn");
                      }}
                    />
                  ) : (
                    <TypedSession
                      key={studyMode}
                      strict={studyMode === "word"}
                      deck={
                        studyMode === "due"
                          ? {
                              ...studyDeck,
                              cards: studyDeck.cards.filter(
                                (c) =>
                                  !c.dueAt || new Date(c.dueAt) <= new Date(),
                              ),
                            }
                          : studyMode === "weak"
                            ? {
                                ...studyDeck,
                                cards: studyDeck.cards.filter(
                                  (c) =>
                                    (c.lapses || 0) > 0 ||
                                    ((c.repetitions || 0) > 0 &&
                                      c.accuracy < 70),
                                ),
                              }
                            : studyDeck
                      }
                      done={backToSet}
                    />
                  )
                ) : (
                  <LibraryView
                    decks={decks}
                    start={start}
                    actions={setActions}
                    create={() => go("Create")}
                  />
                ))}{" "}
              {page === "Import" && (
                <ImportPage
                  onImport={async (d) => {
                    d = normalizeCover({
                      ...d,
                      coverImage:
                        d.coverImage || freshCover(d.id, visibleDecks[0]),
                      createdAt: new Date().toISOString(),
                    });
                    await saveNativeDeck(d, "import");
                    const saved = (await loadNativeDecks()) || [
                      d,
                      ...decks.filter((deck) => deck.id !== d.id),
                    ];
                    setDecks(saved);
                    notify("Cards imported");
                    go("Library");
                  }}
                />
              )}{" "}
              {page === "Create" && (
                <CreatePage
                  key={editingDeck?.id || "new"}
                  initialDeck={editingDeck}
                  initialFolder={newSetFolder}
                  onCreate={async (d) => {
                    d = normalizeCover({
                      ...d,
                      createdAt: d.createdAt || new Date().toISOString(),
                    });
                    await saveNativeDeck(d);
                    const saved = (await loadNativeDecks()) || [
                      d,
                      ...decks.filter((deck) => deck.id !== d.id),
                    ];
                    setDecks(saved);
                    setEditingDeck(null);
                    notify(editingDeck ? "Changes saved" : "Set created");
                    go("Library");
                  }}
                />
              )}{" "}
              {page === "Statistics" && <Stats decks={visibleDecks} />}{" "}
              {page === "Settings" && (
                <SettingsPage
                  showShortcuts={() => setShortcutHelp(true)}
                  dark={dark}
                  setDark={setDark}
                  displayName={displayName}
                  setDisplayName={setDisplayName}
                />
              )}
            </MotionPage>
          </section>
          <Toasts />
        </main>
      </div>
    </UpdateProvider>
  );
}
function Logo() {
  return (
    <span className="logo">
      <span />
    </span>
  );
}
function dayPart() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
function Dashboard({
  decks,
  start,
  go,
}: {
  decks: Deck[];
  start: (deck: Deck, mode?: StudyMode) => void;
  go: (page: Page) => void;
}) {
  const [resume, setResume] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      decks.map(async (d) => {
        try {
          const state = await loadStudySession<WaveState>(d.id, "learn");
          return state && !learnComplete(state) ? d.id : null;
        } catch {
          return null;
        }
      }),
    ).then((ids) => {
      if (active) setResume(ids.filter(Boolean) as string[]);
    });
    return () => {
      active = false;
    };
  }, [decks]);
  const recent = [...decks].sort((a, b) =>
    (
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
  const next = recent.find((d) => resume.includes(d.id)) || recent[0],
    cards = decks.flatMap((d) => d.cards),
    due = dueCards(decks).length,
    today = new Date().toDateString(),
    studied = cards.filter(
      (c) =>
        c.lastReviewed && new Date(c.lastReviewed).toDateString() === today,
    ).length;
  const picks = recent
    .filter(
      (d) =>
        d.id !== next?.id &&
        (d.favorite || d.lastStudied || d.cards.some((c) => c.lastReviewed)),
    )
    .slice(0, 3);
  return (
    <div className="home-dashboard">
      <div className="page-title">
        <div>
          <p className="eyebrow">A LITTLE EVERY DAY</p>
          <h1>
            {decks.length ? "Good " + dayPart() + "." : "Welcome to Flint"}
          </h1>
          <p>
            {decks.length
              ? "Pick up where you left off."
              : "Create your first set and make room for something new."}
          </p>
        </div>
        <div className="button-row">
          <button className="primary" onClick={() => go("Create")}>
            <Plus size={16} />
            New set
          </button>
          <button className="secondary" onClick={() => go("Import")}>
            <Upload size={16} />
            Import cards
          </button>
        </div>
      </div>
      {next && (
        <section className="home-resume">
          <SetCover deck={next} />
          <div>
            <p className="eyebrow">
              {resume.includes(next.id)
                ? "UNFINISHED LEARN SESSION"
                : "CONTINUE STUDYING"}
            </p>
            <h2>{next.title}</h2>
            <p>
              {next.cards.length} cards · {lastStudied(next)}
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() =>
                  start(next, resume.includes(next.id) ? "learn" : undefined)
                }
              >
                {resume.includes(next.id) ? "Resume Learn" : "Open set"}
                <ArrowRight size={16} />
              </button>
              <button className="text-button" onClick={() => go("Library")}>
                Browse library
              </button>
            </div>
          </div>
        </section>
      )}
      <div className="metrics">
        <Metric
          icon={Check}
          label="Studied today"
          value={studied}
          note="Distinct cards reviewed today"
          tone="green"
        />
        <Metric
          icon={Clock3}
          label="Ready for review"
          value={due}
          note="Across your active sets"
          tone="orange"
        />
        <Metric
          icon={BookOpen}
          label="Mastered cards"
          value={cards.filter((c) => c.status === "Mastered").length}
          note="Knowledge that is sticking"
          tone="blue"
        />
      </div>
      {!!picks.length && (
        <section>
          <div className="section-head">
            <div>
              <h2>Back in your rhythm</h2>
              <p>Recent and favorite sets</p>
            </div>
            <button className="text-button" onClick={() => go("Library")}>
              View library →
            </button>
          </div>
          <div className="deck-grid">
            {picks.map((d) => (
              <DeckCard key={d.id} deck={d} start={start} />
            ))}
          </div>
        </section>
      )}
      {!next && (
        <div className="library-empty">
          <BookOpen size={36} />
          <h2>Your next discovery starts here</h2>
          <button className="primary" onClick={() => go("Create")}>
            Create a set
          </button>
        </div>
      )}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: any;
  label: string;
  value: string | number;
  note: string;
  tone: string;
}) {
  return (
    <div className="metric">
      <span className={"metric-icon " + tone}>
        <Icon size={18} />
      </span>
      <small>{label}</small>
      <b>{value}</b>
      <em>{note}</em>
    </div>
  );
}
function DeckCard({
  deck,
  start,
}: {
  deck: Deck;
  start: (deck: Deck) => void;
  edit?: (deck: Deck) => void;
}) {
  return <RichDeckCard deck={deck} start={start} />;
}
function TypedSession({
  deck,
  done,
  strict = false,
}: {
  deck: Deck;
  done: () => void;
  strict?: boolean;
}) {
  const [i, setI] = useState(0),
    [revealed, setRevealed] = useState(false),
    [typed, setTyped] = useState(""),
    [checked, setChecked] = useState<boolean | null>(null),
    [started, setStarted] = useState(Date.now()),
    [error, setError] = useState("");
  const card = deck.cards[i];
  const result = card
    ? gradeAnswer(
        typed,
        card.answer,
        strict || localStorage.getItem("flint-matching") === "Exact"
          ? "strict"
          : localStorage.getItem("flint-matching") === "Minor typo tolerance"
            ? "lenient"
            : "normal",
      )
    : "INCORRECT";
  const next = (rating: string) => {
    reviewNative(card, rating, !!checked, Date.now() - started, typed).catch(
      (reason) => setError(`Review couldn't be saved: ${String(reason)}`),
    );
    if (i === deck.cards.length - 1) return done();
    setI((x) => x + 1);
    setRevealed(false);
    setTyped("");
    setChecked(null);
    setStarted(Date.now());
  };
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!revealed) return;
      const rating: { [key: string]: string } = {
        "1": "Again",
        "2": "Hard",
        "3": "Good",
        "4": "Easy",
      };
      if (rating[event.key]) next(rating[event.key]);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [revealed, i, checked, typed]);
  if (!card)
    return (
      <div className="empty-state">
        <div>
          <GraduationCap size={32} />
          <h1>This set has no cards</h1>
          <p>Add at least one complete question and answer before studying.</p>
          <button className="secondary" onClick={done}>
            Back
          </button>
        </div>
      </div>
    );
  return (
    <div className="study-session">
      {error && (
        <div className="hint danger" role="alert">
          {error}
        </div>
      )}
      <div className="study-top">
        <button onClick={done} aria-label="Back to set">
          <X />
        </button>
        <div>
          <b>{deck.title}</b>
          <span>
            {i + 1} / {deck.cards.length}
          </span>
        </div>
        <div className="study-progress">
          <span style={{ width: `${((i + 1) / deck.cards.length) * 100}%` }} />
        </div>
      </div>
      <div className="study-card">
        <small>QUESTION</small>
        <ManagedImage name={card.questionImage} alt="Question visual" />
        <h1>{card.question}</h1>
        {!revealed ? (
          <>
            <AnswerInput
              cards={deck.cards}
              autoFocus
              placeholder="Type your answer…"
              value={typed}
              onValue={setTyped}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setChecked(result !== "INCORRECT");
                  setRevealed(true);
                }
              }}
            />
            <button
              className="primary wide"
              onClick={() => {
                setChecked(result !== "INCORRECT");
                setRevealed(true);
              }}
            >
              Check answer
            </button>
          </>
        ) : (
          <div className={"answer " + (checked ? "correct" : "incorrect")}>
            <span>{checked ? <Check /> : <X />}</span>
            <div>
              <small>
                {checked
                  ? result === "CLOSE"
                    ? "✓ Close enough"
                    : "CORRECT"
                  : "EXPECTED ANSWER"}
              </small>
              {result === "CLOSE" && <CanonicalAnswer answer={card.answer} />}
              <h2>{card.answer}</h2>
              <ManagedImage name={card.answerImage} alt="Answer visual" />
              {!checked && (
                <>
                  <p>
                    Your answer: <del>{typed || "No answer"}</del>
                  </p>
                  <p>
                    Correct answer: <mark>{card.answer}</mark>
                  </p>
                </>
              )}
              {card.sourceName && (
                <p>
                  Source: {card.sourceName} {card.sourceLocation || ""}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {revealed && (
        <div className="ratings">
          <button onClick={() => next("Again")}>
            <RotateCcw />
            Again <kbd>1</kbd>
          </button>
          <button onClick={() => next("Hard")}>
            Hard <kbd>2</kbd>
          </button>
          <button onClick={() => next("Good")}>
            Good <kbd>3</kbd>
          </button>
          <button onClick={() => next("Easy")}>
            Easy <kbd>4</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

function ImportPage({ onImport }: { onImport: (d: Deck) => Promise<void> }) {
  const [duplicateImport, setDuplicateImport] = useState<Deck | null>(null);
  const [text, setText] = useState(""),
    [source, setSource] = useState(""),
    [cards, setCards] = useState<{ question: string; answer: string }[]>([]),
    [parseResult, setParseResult] = useState(() => parseCardsDetailed("")),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = parseCardsDetailed(text);
      setParseResult(result);
      setCards(result.cards);
      if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
        console.debug("[Flint import] parsed", {
          format: result.format,
          confidence: result.confidence,
          cards: result.cards.length,
        });
    }, 120);
    return () => clearTimeout(timer);
  }, [text]);
  const choose = async () => {
    if (!inTauri()) return;
    const picked = await open({
      multiple: false,
      filters: [
        { name: "Study documents", extensions: ["pdf", "docx", "txt"] },
      ],
    });
    if (typeof picked === "string") {
      setSource(picked.split(/[\\/]/).pop() || picked);
      setText(await extractDocument(picked));
    }
  };
  return (
    <>
      {duplicateImport && (
        <DuplicateReview
          cards={duplicateImport.cards}
          onClose={() => setDuplicateImport(null)}
          onConfirm={async (choices) => {
            setBusy(true);
            try {
              const resolved = resolveDuplicates(
                duplicateImport.cards,
                choices,
              );
              await onImport({ ...duplicateImport, cards: resolved });
              setDuplicateImport(null);
              notify(
                `${resolved.length} cards imported · ${choices.filter((c) => c.action === "skip").length} skipped · ${choices.filter((c) => c.action === "replace").length} replaced`,
              );
            } catch {
              setError("Import failed. Your preview is still available.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      <div className="page-title">
        <div>
          <h1>Import cards</h1>
          <p>
            Paste an export or review extracted document text. Nothing is saved
            until you confirm.
          </p>
        </div>
        <button
          className="secondary"
          disabled={!inTauri()}
          title={!inTauri() ? "Available in the desktop app" : undefined}
          onClick={() => window.dispatchEvent(new Event("flint-import"))}
        >
          Import .flint set
        </button>
        <button className="primary" onClick={choose}>
          <Upload size={16} /> Choose PDF, DOCX, or TXT
        </button>
      </div>
      <div className="import-layout">
        <div className="panel">
          <div className="tabs">
            <span className="active">Paste or extracted text</span>
          </div>
          <label className="field">
            Set title
            <input
              id="import-title"
              placeholder="Name this set"
              defaultValue={source.replace(/\.(pdf|docx|txt)$/i, "")}
            />
          </label>
          <label className="field">
            Review and edit extracted content
            <textarea
              placeholder={"Term\tDefinition\nTerm\tDefinition"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="hint">
            <ShieldCheck size={18} />
            <span>
              Importing from Quizlet? Export or copy your terms, paste them
              here, preview the detected cards, then confirm. Flint never
              scrapes or signs in.
            </span>
          </div>
        </div>
        <div className="panel preview">
          <span className="pill">IMPORT PREVIEW</span>
          <h2>{cards.length} cards found</h2>
          {parseResult.format && (
            <p className="detected-format">
              Detected {parseResult.format} ·{" "}
              {Math.round(parseResult.confidence * 100)}% confidence
            </p>
          )}
          {!!text.trim() && !parseResult.format && (
            <div className="hint danger" role="alert">
              Flint couldn't confidently detect the format. Try tabs, a colon, a
              spaced dash, a pipe, a semicolon, or alternating lines.
            </div>
          )}
          {error && (
            <div className="hint danger" role="alert">
              {error}
            </div>
          )}
          {!!cards.length && (
            <button
              className="preview-tool"
              onClick={() =>
                setCards(
                  cards.map((card) => ({
                    question: card.answer,
                    answer: card.question,
                  })),
                )
              }
            >
              Swap all sides
            </button>
          )}
          {!cards.length && (
            <div className="empty-inline">
              Paste tab-separated cards or choose a document to see a preview.
            </div>
          )}
          {cards.map((c, i) => (
            <div className="preview-card" key={i}>
              <small>{i + 1}</small>
              <div>
                <input
                  aria-label={`Card ${i + 1} term`}
                  value={c.question}
                  onChange={(event) =>
                    setCards(
                      cards.map((card, index) =>
                        index === i
                          ? { ...card, question: event.target.value }
                          : card,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Card ${i + 1} definition`}
                  value={c.answer}
                  onChange={(event) =>
                    setCards(
                      cards.map((card, index) =>
                        index === i
                          ? { ...card, answer: event.target.value }
                          : card,
                      ),
                    )
                  }
                />
              </div>
              <button
                className="preview-remove"
                aria-label={`Remove card ${i + 1}`}
                onClick={() =>
                  setCards(cards.filter((_, index) => index !== i))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="primary wide"
            disabled={!cards.length || busy}
            onClick={async () => {
              const title = (
                document.getElementById("import-title") as HTMLInputElement
              ).value.trim();
              if (!title) return;
              setBusy(true);
              setError("");
              try {
                const importing: Deck = {
                  id: uid(),
                  title,
                  subject: "Imported",
                  color: "#8B6BB1",
                  lastStudied: undefined,
                  cards: cards.map((c) =>
                    newCard(c.question, c.answer, source),
                  ),
                };
                if (duplicateCandidates(importing.cards).length)
                  setDuplicateImport(importing);
                else {
                  await onImport(importing);
                  notify(
                    `${importing.cards.length} cards imported · no duplicates`,
                  );
                }
              } catch (reason) {
                if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
                  console.error("[Flint import] save failed", reason);
                setError("Import failed. Your preview is still available.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Upload size={16} />
            {busy ? "Importing…" : `Import ${cards.length} cards`}
          </button>
        </div>
      </div>
    </>
  );
}
function CreatePage({
  onCreate,
  initialDeck,
  initialFolder,
}: {
  onCreate: (d: Deck) => Promise<void>;
  initialDeck: Deck | null;
  initialFolder?: string;
}) {
  useImageDragFeedback();
  const reduced = useReducedMotion();
  const [duplicateDraft, setDuplicateDraft] = useState<Deck | null>(null),
    [bulkText, setBulkText] = useState("");
  const [removingCards, setRemovingCards] = useState<string[]>([]);
  const exitTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => exitTimers.current.forEach(clearTimeout), []);
  const draft = (() => {
    try {
      return JSON.parse(localStorage.getItem("flint-create-draft") || "null");
    } catch {
      return null;
    }
  })();
  const blankDraftCard = () => ({
    draftId: uid(),
    cardId: undefined as string | undefined,
    question: "",
    answer: "",
    questionImage: null as string | null,
    answerImage: null as string | null,
    questionAudio: null as string | null,
    answerAudio: null as string | null,
    questionVideo: null as string | null,
    answerVideo: null as string | null,
    structure: null as StructuredCard | null,
  });
  const [setId] = useState(initialDeck?.id || draft?.setId || uid());
  const [description, setDescription] = useState(
    initialDeck?.meta?.description || draft?.description || "",
  );
  const [folder, setFolder] = useState(
    initialDeck?.meta?.folder ?? initialFolder ?? draft?.folder ?? "",
  );
  const [tags, setTags] = useState(
    initialDeck?.meta?.tags?.join(", ") || draft?.tags || "",
  );
  const initialCards = initialDeck
    ? initialDeck.cards.map((card) => ({
        draftId: uid(),
        cardId: card.id,
        question: card.question,
        answer: card.answer,
        questionImage: card.questionImage || null,
        answerImage: card.answerImage || null,
        questionAudio: card.questionAudio || null,
        answerAudio: card.answerAudio || null,
        questionVideo: card.questionVideo || null,
        answerVideo: card.answerVideo || null,
        structure: card.structure || null,
        starred: initialDeck.meta?.starredCards?.includes(card.id) || false,
      }))
    : Array.isArray(draft?.cards)
      ? draft.cards.map(
          (card: {
            draftId?: string;
            cardId?: string;
            question?: string;
            answer?: string;
            questionImage?: string | null;
            answerImage?: string | null;
            questionAudio?: string | null;
            answerAudio?: string | null;
            questionVideo?: string | null;
            answerVideo?: string | null;
            structure?: StructuredCard | null;
            starred?: boolean;
          }) => ({
            draftId: card.draftId || uid(),
            cardId: card.cardId,
            question: card.question || "",
            answer: card.answer || "",
            questionImage: card.questionImage || null,
            answerImage: card.answerImage || null,
            questionAudio: card.questionAudio || null,
            answerAudio: card.answerAudio || null,
            questionVideo: card.questionVideo || null,
            answerVideo: card.answerVideo || null,
            structure: card.structure || null,
            starred: !!card.starred,
          }),
        )
      : [blankDraftCard()];
  const [title, setTitle] = useState(initialDeck?.title || draft?.title || ""),
    [subject, setSubject] = useState(
      initialDeck?.subject || draft?.subject || "",
    ),
    [coverImage, setCoverImage] = useState<string | null>(
      initialDeck?.coverImage ||
        draft?.coverImage ||
        freshCover(setId, load()[0]),
    ),
    [cards, setCards, undoCards, canUndoCards, redoCards, canRedoCards] =
      useUndoState<
        {
          draftId: string;
          cardId?: string;
          question: string;
          answer: string;
          questionImage?: string | null;
          answerImage?: string | null;
          questionAudio?: string | null;
          answerAudio?: string | null;
          questionVideo?: string | null;
          answerVideo?: string | null;
          structure?: StructuredCard | null;
          starred?: boolean;
        }[]
      >(initialCards.length ? initialCards : [blankDraftCard()]),
    [saved, setSaved] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (initialDeck) return;
    setSaved(false);
    const timer = setTimeout(() => {
      localStorage.setItem(
        "flint-create-draft",
        JSON.stringify({
          setId,
          title,
          subject,
          coverImage,
          cards,
          description,
          folder,
          tags,
        }),
      );
      if(!inTauri())setSaved(true);
      else void syncDraftMedia().then(()=>setSaved(true)).catch(()=>setError("Draft saved locally, but media protection could not be synchronized. Retry before cleanup."));
    }, 250);
    return () => clearTimeout(timer);
  }, [
    title,
    subject,
    coverImage,
    cards,
    initialDeck,
    description,
    folder,
    tags,
    setId,
  ]);
  const finish = async () => {
    if (cards.some(card => !isValidCardDraft(card))) {
      setError("Complete each card before saving. Select an issue below to return to that card.");
      return;
    }
    const complete = cards.filter(isValidCardDraft);
    if (!canCreateDeck(title, cards)) return;
    setBusy(true);
    setError("");
    try {
      const deck = {
        ...initialDeck,
        id: setId,
        title: title.trim(),
        subject: subject.trim(),
        color: initialDeck?.color || "#EF6C3A",
        favorite: initialDeck?.favorite,
        lastStudied: initialDeck?.lastStudied,
        coverImage,
        meta: {
          ...initialDeck?.meta,
          description: description.trim(),
          folder: folder.trim(),
          tags: tags
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean),
        },
        cards: complete.map((c) => ({
          ...(initialDeck?.cards.find((card) => card.id === c.cardId) ||
            newCard(c.question.trim(), c.answer.trim())),
          question: c.question.trim(),
          answer: c.answer.trim(),
          id: c.cardId || uid(),
          questionImage: c.questionImage || null,
          answerImage: c.answerImage || null,
          questionAudio: c.questionAudio || null,
          answerAudio: c.answerAudio || null,
          questionVideo: c.questionVideo || null,
          answerVideo: c.answerVideo || null,
          structure: c.structure || null,
        })),
      };
      deck.meta.starredCards = complete.flatMap((card, index) =>
        card.starred ? [deck.cards[index].id] : [],
      );
      if (duplicateCandidates(deck.cards).length) {
        setDuplicateDraft(deck);
        return;
      }
      await onCreate(deck);
      if (!initialDeck) localStorage.removeItem("flint-create-draft");
    } catch (reason) {
      if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV)
        console.error("[Flint create] save failed", reason);
      setError("Couldn't create this set. Your draft is still saved.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || document.querySelector('dialog[open],[aria-modal="true"]')) return;
      if (event.ctrlKey || event.metaKey) {
        if (
          ["z", "y"].includes(event.key.toLowerCase()) &&
          (!editableTarget(event.target) ||
            (event.target instanceof Element &&
              event.target.closest(".edit-card")))
        ) {
          event.preventDefault();
          event.stopPropagation();
          if (!busy && !removingCards.length) {
            if (event.shiftKey || event.key.toLowerCase() === "y") redoCards();
            else undoCards();
          }
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy && !removingCards.length) document.querySelector<HTMLButtonElement>(".editor-cards .add-card")?.click();
        } else if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopPropagation();
          if (!busy && !removingCards.length) void finish();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [
    cards,
    title,
    subject,
    folder,
    tags,
    coverImage,
    description,
    busy,
    removingCards,
  ]);
  return (
    <>
      {duplicateDraft && (
        <DuplicateReview
          cards={duplicateDraft.cards}
          onClose={() => setDuplicateDraft(null)}
          onConfirm={async (choices) => {
            setBusy(true);
            try {
              const resolved = resolveDuplicates(duplicateDraft.cards, choices);
              const ids = new Set(resolved.map((c) => c.id));
              await onCreate({
                ...duplicateDraft,
                cards: resolved,
                meta: {
                  ...duplicateDraft.meta,
                  starredCards: resolvedStars(
                    duplicateDraft.meta?.starredCards || [],
                    resolved,
                    choices,
                  ),
                },
              });
              if (!initialDeck) localStorage.removeItem("flint-create-draft");
              setDuplicateDraft(null);
              notify(
                `${resolved.length} cards saved · ${choices.filter((c) => c.action === "skip").length} duplicates skipped · ${choices.filter((c) => c.action === "replace").length} replaced`,
              );
            } catch {
              setError(
                "Could not save resolved cards. Your choices can be retried.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      <div className="page-title">
        <div>
          <h1>{initialDeck ? "Edit set" : "Create a set"}</h1>
          <p>
            {initialDeck ? (
              "Changes are saved when you click Save."
            ) : (
              <>
                Drafts are saved locally as you type.{" "}
                <span className="saved-state">
                  {saved ? "Saved" : "Saving…"}
                </span>
              </>
            )}
          </p>
        </div>
        <button
          className="primary"
          disabled={
            !canCreateDeck(title, cards) || busy || !!removingCards.length
          }
          onClick={finish}
          title={`Save set (${modifierLabel()} S)`}
        >
          {busy
            ? initialDeck
              ? "Saving…"
              : "Creating…"
            : initialDeck
              ? "Save"
              : "Create"}
        </button>
      </div>
      {error && (
        <div className="hint danger" role="alert">
          {error}
        </div>
      )}
      <div className="editor panel">
        <div className="button-row">
          <button
            className="secondary"
            disabled={!canUndoCards || busy || !!removingCards.length}
            onClick={undoCards}
          >
            Undo card edit
          </button>
          <details>
            <summary>Paste / bulk add cards</summary>
            <textarea
              aria-label="Bulk cards"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Term&#9;Definition"
            />
            <button
              className="secondary"
              onClick={() => {
                const parsed = parseCardsDetailed(bulkText).cards;
                setCards((old) => [
                  ...old,
                  ...parsed.map((card) => ({ ...blankDraftCard(), ...card })),
                ]);
                setBulkText("");
                notify(
                  `${parsed.length} cards added — Undo`,
                  "success",
                  undoCards,
                );
              }}
            >
              Add pasted cards
            </button>
          </details>
        </div>
        <input
          className="title-input"
          placeholder="Set title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="set-meta-fields">
          <label>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you learn?"
            />
          </label>
          <label>
            Folder
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g. Semester one"
            />
          </label>
          <label>
            Tags
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Separate tags with commas"
            />
          </label>
        </div>
        <div className="card-row">
          <span />
          <label>
            SUBJECT (OPTIONAL)
            <input
              placeholder="e.g. Biology"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>
          <span />
          <span />
        </div>
        <div className="card-row">
          <span />
          <div>
            <b>Cover</b>
            <CoverEditor
              deck={{ id: setId, title: title || "New set", coverImage }}
              onChange={setCoverImage}
            />
          </div>
          <span />
          <span />
        </div>
        <div
          className="editor-cards"
        >
          {cards.map((c, i) => (
            <article
              id={"draft-"+c.draftId}
              tabIndex={-1}
              className={
                "edit-card" +
                (removingCards.includes(c.draftId) ? " removing" : "")
              }
              key={c.draftId}
            >
              {cardIssues(c).length>0 && <div className="card-validation" role="status">{cardIssues(c).map(issue=><button type="button" className="text-button" key={issue} onClick={()=>{const card=document.getElementById("draft-"+c.draftId);card?.scrollIntoView({block:"center"});(card?.querySelector("textarea,input,select") as HTMLElement|null)?.focus();}}>Card {i+1} — {issue}</button>)}</div>}
              <div className="edit-card-head">
                <b>{i + 1}</b>
                <div>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Move card ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() =>
                      setCards((old) => {
                        const next = [...old];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        return next;
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Move card ${i + 1} down`}
                    disabled={i === cards.length - 1}
                    onClick={() =>
                      setCards((old) => {
                        const next = [...old];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        return next;
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Star editor card ${i + 1}`}
                    aria-pressed={!!c.starred}
                    onClick={() =>
                      setCards((old) =>
                        old.map((v) =>
                          v.draftId === c.draftId
                            ? { ...v, starred: !v.starred }
                            : v,
                        ),
                      )
                    }
                  >
                    {c.starred ? "★" : "☆"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Duplicate card ${i + 1}`}
                    onClick={() =>
                      setCards((x) => [
                        ...x.slice(0, i + 1),
                        { ...c, draftId: uid(), cardId: undefined },
                        ...x.slice(i + 1),
                      ])
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Delete card ${i + 1}`}
                    disabled={
                      cards.length === 1 || removingCards.includes(c.draftId)
                    }
                    onClick={(event) => {
                      const element = event.currentTarget.closest("article");
                      if (!reduced)
                        element?.animate?.(
                          [
                            {
                              height:
                                element.getBoundingClientRect().height + "px",
                              opacity: 1,
                            },
                            { height: "0px", opacity: 0, marginBottom: "0px" },
                          ],
                          {
                            duration: motion.panel,
                            fill: "forwards",
                            easing: "cubic-bezier(.2,.7,.2,1)",
                          },
                        );
                      setRemovingCards((ids) => [...ids, c.draftId]);
                      exitTimers.current.push(
                        setTimeout(
                          () => {
                            setCards((x) =>
                              x.filter((v) => v.draftId !== c.draftId),
                            );
                            notify("Card deleted — Undo", "success", undoCards);
                            setRemovingCards((ids) =>
                              ids.filter((id) => id !== c.draftId),
                            );
                          },
                          reduced ? 0 : motion.panel,
                        ),
                      );
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <StructuredEditor value={c.structure} onChange={structure => setCards(old => old.map(card => card.draftId === c.draftId ? {...card,structure} : card))}>
              <div className="edit-card-sides">
                <button
                  type="button"
                  className="side-swap icon"
                  title="Swap front and back"
                  aria-label="Swap front and back"
                  onClick={() =>
                    setCards((old) =>
                      old.map((v) =>
                        v.draftId === c.draftId ? swapSides(v) : v,
                      ),
                    )
                  }
                >
                  ⇄
                </button>
                {(["question", "answer"] as const).map((side) => (
                  <section key={side}>
                    <ImageDestination>
                      <label>
                        {side === "question" ? "Front" : "Back"}
                        <SmartMathTextarea
                          value={c[side]}
                          suggestion={side === "answer" && !c.answer ? mathSuggestion(c.question) : null}
                          onAcceptSuggestion={answer => setCards(old => old.map(v => v.draftId === c.draftId && !v.answer ? {...v,answer} : v))}
                          placeholder={
                            side === "question"
                              ? "Add front text"
                              : "Add back text"
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            setCards((x) =>
                              x.map((v) =>
                                v.draftId === c.draftId
                                  ? { ...v, [side]: value }
                                  : v,
                              ),
                            );
                          }}
                        />
                      </label>
                      <InsertMedia>
                        <VideoField
                          label={side + " video"}
                          value={
                            side === "question"
                              ? c.questionVideo
                              : c.answerVideo
                          }
                          onChange={(value) =>
                            setCards((old) =>
                              old.map((card, j) =>
                                j === i
                                  ? {
                                      ...card,
                                      [side === "question"
                                        ? "questionVideo"
                                        : "answerVideo"]: value,
                                    }
                                  : card,
                              ),
                            )
                          }
                        />
                        <AudioField
                          label={side + " audio"}
                          value={
                            side === "question"
                              ? c.questionAudio
                              : c.answerAudio
                          }
                          onChange={(value) =>
                            setCards((old) =>
                              old.map((v) =>
                                v.draftId === c.draftId
                                  ? {
                                      ...v,
                                      [side === "question"
                                        ? "questionAudio"
                                        : "answerAudio"]: value,
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                        <ImageField
                          label={side + " image"}
                          value={
                            side === "question"
                              ? c.questionImage
                              : c.answerImage
                          }
                          onChange={(value) =>
                            setCards((x) =>
                              x.map((v) =>
                                v.draftId === c.draftId
                                  ? {
                                      ...v,
                                      [side === "question"
                                        ? "questionImage"
                                        : "answerImage"]: value,
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                      </InsertMedia>
                    </ImageDestination>
                  </section>
                ))}
              </div>
              </StructuredEditor>
            </article>
          ))}
          <button
            className="add-card"
            title={`Add card (${modifierLabel()} Enter)`}
            onClick={() => {
              setCards((x) => [...x, blankDraftCard()]);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLTextAreaElement>(
                    ".editor-cards .edit-card:last-of-type textarea",
                  )
                  ?.focus(),
              );
            }}
          >
            + Add card
          </button>
        </div>
      </div>
    </>
  );
}
function Stats({ decks }: { decks: Deck[] }) {
  const cards = decks.flatMap((deck) => deck.cards);
  const studied = cards.filter((card) => (card.repetitions || 0) > 0);
  const reviews = cards.reduce((sum, card) => sum + (card.repetitions || 0), 0);
  const accuracy = studied.length
    ? Math.round(
        studied.reduce((sum, card) => sum + card.accuracy, 0) / studied.length,
      )
    : null;
  if (!reviews)
    return (
      <>
        <div className="page-title">
          <div>
            <h1>Statistics</h1>
            <p>Your study history, stored only on this device.</p>
          </div>
        </div>
        <div className="empty-state">
          <div>
            <BarChart3 size={32} />
            <h1>No study history yet</h1>
            <p>
              Complete a study session and Flint will show accuracy, review
              counts, and mastery here.
            </p>
          </div>
        </div>
      </>
    );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Statistics</h1>
          <p>A clear view of your learning, stored only on this device.</p>
        </div>
      </div>
      <div className="metrics">
        <Metric
          icon={BookOpen}
          label="Reviews completed"
          value={reviews}
          note={`${studied.length} distinct cards`}
          tone="blue"
        />
        <Metric
          icon={Target}
          label="Accuracy"
          value={`${accuracy}%`}
          note="Across studied cards"
          tone="green"
        />
        <Metric
          icon={Check}
          label="Mastered"
          value={cards.filter((card) => card.status === "Mastered").length}
          note="Scheduled to return later"
          tone="orange"
        />
        <Metric
          icon={Clock3}
          label="Due now"
          value={dueCards(decks).length}
          note="Based on saved schedules"
          tone="amber"
        />
      </div>
    </>
  );
}
function SettingsPage({
  showShortcuts,
  dark,
  setDark,
  displayName,
  setDisplayName,
}: {
  showShortcuts: () => void;
  dark: boolean;
  setDark: (x: boolean) => void;
  displayName: string;
  setDisplayName: (x: string) => void;
}) {
  const [themeMode,setThemeMode]=usePreference<string>("theme-mode","manual");
  const [matching, setMatching] = useState(
    localStorage.getItem("flint-matching") || "Flexible",
  );
  return (
    <>
      <div className="page-title">
        <div>
          <h1>Settings</h1>
          <p>Make Flint work the way you study.</p>
        </div>
      </div>
      <div className="settings-grid">
        <h2>Appearance & profile</h2>
        <div className="panel setting">
          <span>
            <Keyboard />
            <div>
              <b>Keyboard shortcuts / Help</b>
              <p>Find your way around Flint.</p>
            </div>
          </span>
          <button className="secondary" onClick={showShortcuts}>
            Keyboard shortcuts
          </button>
        </div>
        <div className="panel setting">
          <span>
            <BookOpen />
            <div>
              <b>Local profile</b>
              <p>Optional. No account is created.</p>
            </div>
          </span>
          <input
            aria-label="Display name"
            placeholder="What should Flint call you?"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              localStorage.setItem("flint-display-name", e.target.value);
            }}
          />
        </div>
        <div className="panel setting">
          <span>
            <Sun />
            <div>
              <b>Appearance</b>
              <p>Choose your preferred app theme.</p>
            </div>
          </span>
          <select aria-label="Appearance theme" value={themeMode==="system"?"system":dark?"dark":"light"} onChange={event=>{if(event.target.value==="system")setThemeMode("system");else setDark(event.target.value==="dark");}}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
        </div>
        <StudyPreferences/>
        <div className="panel setting">
          <span>
            <Keyboard />
            <div>
              <b>Answer matching</b>
              <p>Ignore capitalization and punctuation.</p>
            </div>
          </span>
          <select
            value={matching}
            onChange={(e) => {
              setMatching(e.target.value);
              localStorage.setItem("flint-matching", e.target.value);
            }}
          >
            <option>Flexible</option>
            <option>Exact</option>
            <option>Minor typo tolerance</option>
          </select>
        </div>
        <EditorPreferences/>
        <AccessibilityPreferences/>
        <h2>Storage & Data</h2>
        <BackupSettings />
        <StorageMaintenance />
        <h2>About & Updates</h2>
        <UpdateSettings />
        <AboutSettings />
      </div>
    </>
  );
}
function AboutSettings() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    if (inTauri())
      getVersion()
        .then(setVersion)
        .catch(() => setVersion("Unavailable"));
    else setVersion("Development");
  }, []);
  return (
    <div className="panel setting">
      <span>
        <Logo />
        <div>
          <b>About Flint</b>
          <p><a href="https://github.com/Angingongic/flint/releases/latest" target="_blank" rel="noreferrer">Official Flint downloads</a></p>
          <p>
            Version {displayVersion(version) || "Loading…"} · Local-first study
            application
          </p>
        </div>
      </span>
    </div>
  );
}
function BackupSettings() {
  const [preview,setPreview]=useState<{token:string;sets:number;cards:number;mediaFiles:number;appVersion:string;hasPreferences:boolean}|null>(null);
  const [busy,setBusy]=useState(false);
  const [status, setStatus] = useState(
    "Portable .flintbackup archives include your SQLite library and history.",
  );
  const exportAll = async () => {
    if (!inTauri()) {
      setStatus("Backups are available in the installed desktop app.");
      return;
    }
    const path = await save({
      defaultPath: `Flint-${new Date().toISOString().slice(0, 10)}.flintbackup`,
      filters: [{ name: "Flint backup", extensions: ["flintbackup"] }],
    });
    if (path) {
      await createBackup(path);
      notify("Backup created");
      setStatus(`Backup created: ${path}`);
    }
  };
  const restore = async () => {
    if(!inTauri()){setStatus("Backups are available in the installed desktop app.");return;}
    const path = await open({
      multiple: false,
      filters: [{ name: "Flint backup", extensions: ["flintbackup"] }],
    });
    if (typeof path === "string") {
      setBusy(true);try{setPreview(await invoke("preview_backup",{path}));}catch(e){setStatus(String(e));}finally{setBusy(false);}
    }
  };
  return (
    <div className="panel setting">
      <span>
        <ShieldCheck />
        <div>
          <b>Backups</b>
          <p>{status}</p>
        </div>
      </span>
      <div className="button-row">
        <button disabled={busy} onClick={()=>void exportAll().catch(e=>setStatus(String(e)))}>Export entire library</button>
        <button disabled={busy} onClick={()=>void restore().catch(e=>setStatus(String(e)))}>Restore backup</button>
      </div>
      {preview&&<Modal title="Preview backup restore" onClose={()=>{if(!busy)setPreview(null);}}><p>Created with Flint {preview.appVersion}. {preview.sets} sets, {preview.cards} cards and {preview.mediaFiles} media files. {preview.hasPreferences?"Includes preferences.":"Existing preferences will be kept."}</p><p>This replaces the active library on next launch. Your complete current library will be retained in a restore-recovery folder inside Flint app data. The source backup is unchanged.</p><div className="modal-actions"><button disabled={busy} onClick={()=>setPreview(null)}>Cancel</button><button disabled={busy} className="danger" onClick={async()=>{setBusy(true);try{await restoreBackup(preview.token);setPreview(null);setStatus("Validated restore queued. Close and reopen Flint to apply it. Your current library remains active until then.");}catch(e){setStatus(String(e));}finally{setBusy(false);}}}>Queue restore for next launch</button></div></Modal>}
    </div>
  );
}
