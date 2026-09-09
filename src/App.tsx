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
  SetActions,
} from "./LibraryView";
import { updateDeckDetails, exportFlint } from "./native";
import { PortableSets } from "./PortableSet";
import {
  Home,
  Library,
  GraduationCap,
  Download,
  Plus,
  BarChart3,
  Settings,
  Search,
  Command,
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
import { getVersion } from "@tauri-apps/api/app";
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
  ["Study", GraduationCap],
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
      .map(normalizeCover);
  } catch {
    return [];
  }
};
export function App() {
  const [portableBusy, setPortableBusy] = useState(false);
  const [page, setPage] = useState<Page>("Home");
  const [decks, setDecks] = useState<Deck[]>(load);
  const [dark, setDark] = useState(
    localStorage.getItem("flint-theme") !== "light",
  );
  const [studyDeck, setStudyDeck] = useState<Deck | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode | null>(null);
  const [practiceDeck, setPracticeDeck] = useState<Deck | null>(null);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(
    localStorage.getItem("flint-display-name") || "",
  );
  const [appError, setAppError] = useState("");
  useEffect(() => {
    loadNativeDecks()
      .then((native) => {
        if (native) setDecks(native);
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        go("Library");
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const go = (p: Page) => {
    window.location.hash = p;
    setPage(p);
    setStudyDeck(null);
    setPracticeDeck(null);
    setStudyMode(null);
  };
  const start = (d?: Deck, mode?: StudyMode) => {
    if (!d) {
      window.location.hash = "Study";
      setStudyDeck(null);
      setPage("Study");
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
  const setActions: SetActions = {
    edit: editSet,
    update: async (deck) => {
      await updateDeckDetails(deck);
      setDecks((current) =>
        current.map((d) =>
          d.id === deck.id
            ? {
                ...d,
                favorite: deck.favorite,
                coverImage: deck.coverImage,
                meta: deck.meta,
              }
            : d,
        ),
      );
      if (studyDeck?.id === deck.id) setStudyDeck(deck);
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
          archived: false,
          starredCards: [],
        },
        cards: deck.cards.map((c) => ({
          ...newCard(c.question, c.answer),
          questionImage: c.questionImage,
          answerImage: c.answerImage,
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
                className={page === label ? "active" : ""}
                onClick={() => {
                  if (label === "Create") setEditingDeck(null);
                  go(label);
                }}
              >
                <Icon size={18} />
                <span>{label}</span>
                {label === "Study" && <kbd>⌘ S</kbd>}
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
            <label className="search">
              <Search size={17} />
              <input
                ref={searchRef}
                aria-label="Search sets and cards"
                placeholder="Search sets, cards, and subjects"
                value={query}
                onFocus={() => {
                  if (page !== "Library") go("Library");
                }}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>
                <Command size={12} /> K
              </kbd>
            </label>
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
              <button className="study-now" onClick={() => start()}>
                <Play size={15} fill="currentColor" /> Study now
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
                  globalQuery={query}
                  create={() => {
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
                  <StudyHub decks={visibleDecks} start={start} go={go} />
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
  start: (d: Deck) => void;
  go: (p: Page) => void;
}) {
  const cards = decks.flatMap((d) => d.cards),
    dueList = dueCards(decks),
    weakList = [...cards].sort(
      (a, b) =>
        (b.lapses || 0) * 20 +
        (100 - b.accuracy) +
        (b.due ? 30 : 0) -
        ((a.lapses || 0) * 20 + (100 - a.accuracy) + (a.due ? 30 : 0)),
    ),
    due = dueList.length,
    mastered = cards.filter((c) => c.status === "Mastered").length;
  const queue = (title: string, selected: typeof cards): Deck => ({
    id: `queue-${title}`,
    title,
    subject: "Adaptive study",
    color: "#EF6C3A",
    cards: selected,
  });
  const reviews = cards.reduce((sum, card) => sum + (card.repetitions || 0), 0);
  const reviewedCards = cards.filter((card) => (card.repetitions || 0) > 0);
  const accuracy = reviewedCards.length
    ? Math.round(
        reviewedCards.reduce((sum, card) => sum + card.accuracy, 0) /
          reviewedCards.length,
      )
    : null;
  const weakStudied = weakList.filter((card) => (card.repetitions || 0) > 0);
  if (!decks.length) {
    return (
      <div className="empty-state">
        <div>
          <Logo />
          <h1>Welcome to Flint</h1>
          <p>
            Create your first study set or bring in existing cards. Your library
            stays private and available offline on this device.
          </p>
          <div className="empty-actions">
            <button className="primary" onClick={() => go("Create")}>
              <Plus size={16} /> Create a set
            </button>
            <button className="secondary" onClick={() => go("Import")}>
              <Upload size={16} /> Import cards
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="welcome">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            }).format(new Date())}
          </p>
          <h1>Good {dayPart()}.</h1>
          <p>
            You’ve got <b>{due} cards</b> ready for review. A quick session
            keeps the streak alive.
          </p>
        </div>
      </div>
      <div className="continue">
        <div>
          <span className="pill">READY TO STUDY</span>
          <h2>{decks[0].title}</h2>
          <p>
            {decks[0].cards.length} cards · {dueList.length} currently due
          </p>
        </div>
        <div className="button-row">
          <button
            disabled={!dueList.length}
            onClick={() => start(queue("Due cards", dueList))}
          >
            <Clock3 size={18} /> Study due cards
          </button>
          <button
            onClick={() => start(queue("Weak cards", weakList.slice(0, 30)))}
          >
            <Target size={18} /> Study weak cards
          </button>
        </div>
      </div>
      {(due > 0 || reviews > 0) && (
        <div className="metrics">
          <Metric
            icon={Clock3}
            label="Due today"
            value={due}
            note="Scheduled from your review history"
            tone="orange"
          />
          {accuracy !== null && (
            <Metric
              icon={Target}
              label="Accuracy"
              value={`${accuracy}%`}
              note="Across studied cards"
              tone="blue"
            />
          )}
          {reviews > 0 && (
            <Metric
              icon={BookOpen}
              label="Reviews completed"
              value={reviews}
              note="Across your library"
              tone="green"
            />
          )}
          {mastered > 0 && (
            <Metric
              icon={Check}
              label="Mastered"
              value={mastered}
              note="Cards scheduled to return later"
              tone="amber"
            />
          )}
        </div>
      )}
      <div className="section-head">
        <div>
          <h2>Recent sets</h2>
          <p>Pick up where you left off</p>
        </div>
        <button onClick={() => go("Library")}>
          View library <ArrowRight size={15} />
        </button>
      </div>
      <div className="deck-grid">
        {decks.map((d) => (
          <DeckCard key={d.id} deck={d} start={start} />
        ))}
      </div>
      {weakStudied.length > 0 && (
        <div className="lower">
          <div className="panel">
            <div className="section-head">
              <div>
                <h2>Needs attention</h2>
                <p>Your weakest cards across all sets</p>
              </div>
              <button
                onClick={() =>
                  start(queue("Weak cards", weakList.slice(0, 30)))
                }
              >
                Study all <ArrowRight size={15} />
              </button>
            </div>
            {weakStudied.slice(0, 3).map((c) => (
              <div className="weak" key={c.id}>
                <span className="status-dot" />
                <div>
                  <b>{c.question}</b>
                  <small>{c.answer}</small>
                </div>
                <span>{c.accuracy}%</span>
                <ChevronDown size={16} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
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
function StudyHub({
  decks,
  start,
  go,
}: {
  decks: Deck[];
  start: (d: Deck, mode?: StudyMode) => void;
  go: (p: Page) => void;
}) {
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">MAKE A LITTLE PROGRESS</p>
          <h1>Ready to study?</h1>
          <p>Choose a set, then find your rhythm.</p>
        </div>
      </div>
      {decks.length ? (
        <div className="rich-deck-grid">
          {decks.map((deck) => (
            <RichDeckCard key={deck.id} deck={deck} start={start} />
          ))}
        </div>
      ) : (
        <div className="library-empty">
          <h2>Your next discovery starts here.</h2>
          <button className="primary" onClick={() => go("Create")}>
            Create a set
          </button>
        </div>
      )}
    </>
  );
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
function ManagedImage({ name, alt }: { name?: string | null; alt: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    mediaUrl(name)
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [name]);
  return src ? <img className="study-image" src={src} alt={alt} /> : null;
}

function ImportPage({ onImport }: { onImport: (d: Deck) => Promise<void> }) {
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
                await onImport({
                  id: uid(),
                  title,
                  subject: "Imported",
                  color: "#8B6BB1",
                  lastStudied: undefined,
                  cards: cards.map((c) =>
                    newCard(c.question, c.answer, source),
                  ),
                });
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
function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removedPreview, setRemovedPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (removalTimer.current) clearTimeout(removalTimer.current);
    },
    [],
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [large, setLarge] = useState(false);
  const process = async (file: File) => {
    setError("");
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 25 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG or WebP image under 25 MB.");
      return;
    }
    setBusy(true);
    try {
      if (inTauri()) onChange(await saveMediaBytes(file));
      else
        onChange(
          await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
        );
      notify("Image added");
    } catch {
      setError("Could not attach the image. Please try again.");
      notify("Could not attach the image", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="attachment"
      tabIndex={0}
      aria-label={label + " attachment"}
      title="Choose, drop, or paste PNG, JPEG or WebP"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) void process(e.dataTransfer.files[0]);
      }}
      onPaste={(e) => {
        if (e.clipboardData.files[0]) {
          e.preventDefault();
          void process(e.clipboardData.files[0]);
        }
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) void process(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {(value || removedPreview) && (
        <button
          className={"attachment-thumb" + (removing ? " removing" : "")}
          onClick={() => setLarge(true)}
          aria-label={"View larger " + label}
        >
          <ManagedImage name={value || removedPreview} alt={label} />
        </button>
      )}
      <div className="attachment-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy
            ? "Attaching…"
            : value
              ? "Replace"
              : label === "cover image"
                ? "Upload image"
                : "+ Image"}
        </button>
        {value && (
          <>
            <button
              className="secondary"
              disabled={removing}
              onClick={() => {
                setRemovedPreview(value || null);
                onChange(null);
                setRemoving(true);
                removalTimer.current = setTimeout(
                  () => {
                    setRemovedPreview(null);
                    setRemoving(false);
                  },
                  reduced ? 0 : motion.panel,
                );
              }}
            >
              {label === "cover image" ? "Use Flint preset" : "Remove"}
            </button>
            <button className="secondary" onClick={() => setLarge(true)}>
              View larger
            </button>
          </>
        )}
      </div>
      {error && <small role="alert">{error}</small>}
      {large && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLarge(false);
          }}
        >
          <button
            autoFocus
            className="secondary"
            onClick={() => setLarge(false)}
          >
            Close preview
          </button>
          <ManagedImage name={value} alt={label} />
        </div>
      )}
    </div>
  );
}
function CreatePage({
  onCreate,
  initialDeck,
}: {
  onCreate: (d: Deck) => Promise<void>;
  initialDeck: Deck | null;
}) {
  const reduced = useReducedMotion();
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
  });
  const [setId] = useState(initialDeck?.id || draft?.setId || uid());
  const [description, setDescription] = useState(
    initialDeck?.meta?.description || draft?.description || "",
  );
  const [folder, setFolder] = useState(
    initialDeck?.meta?.folder || draft?.folder || "",
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
          }) => ({
            draftId: card.draftId || uid(),
            cardId: card.cardId,
            question: card.question || "",
            answer: card.answer || "",
            questionImage: card.questionImage || null,
            answerImage: card.answerImage || null,
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
    [cards, setCards] = useState<
      {
        draftId: string;
        cardId?: string;
        question: string;
        answer: string;
        questionImage?: string | null;
        answerImage?: string | null;
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
      setSaved(true);
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
        })),
      };
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
  return (
    <>
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
            <CoverPicker
              deck={{ id: setId, title: title || "New set", coverImage }}
              onChange={setCoverImage}
            />
            <ImageField
              label="cover image"
              value={
                coverImage?.startsWith("flint:preset/") ? null : coverImage
              }
              onChange={(value) =>
                setCoverImage(value || presetFor({ id: setId }).id)
              }
            />
          </div>
          <span />
          <span />
        </div>
        <div
          className="editor-cards"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              setCards((x) => [...x, blankDraftCard()]);
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLTextAreaElement>(
                    ".editor-cards .edit-card:last-of-type textarea",
                  )
                  ?.focus(),
              );
            }
          }}
        >
          {cards.map((c, i) => (
            <article
              className={
                "edit-card" +
                (removingCards.includes(c.draftId) ? " removing" : "")
              }
              key={c.draftId}
            >
              <div className="edit-card-head">
                <b>{i + 1}</b>
                <div>
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
              <div className="edit-card-sides">
                {(["question", "answer"] as const).map((side) => (
                  <section key={side}>
                    <label>
                      {side === "question"
                        ? "TERM / QUESTION"
                        : "DEFINITION / ANSWER"}
                      <textarea
                        value={c[side]}
                        placeholder={
                          side === "question"
                            ? "Enter a term or question"
                            : "Enter a definition or answer"
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
                    <ImageField
                      label={side + " image"}
                      value={
                        side === "question" ? c.questionImage : c.answerImage
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
                  </section>
                ))}
              </div>
            </article>
          ))}
          <button
            className="add-card"
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
            + Add card <kbd>Ctrl / ⌘ Enter</kbd>
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
  dark,
  setDark,
  displayName,
  setDisplayName,
}: {
  dark: boolean;
  setDark: (x: boolean) => void;
  displayName: string;
  setDisplayName: (x: string) => void;
}) {
  const [accents, setAccents] = useState(ignoreAccents);
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
          <button onClick={() => setDark(!dark)}>
            {dark ? "Dark" : "Light"} <ChevronDown />
          </button>
        </div>
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
        <div className="panel setting">
          <label>
            <b>Ignore accents</b>
            <p>Accept diacritic differences independently of typo tolerance.</p>
            <input
              type="checkbox"
              checked={accents}
              onChange={(e) => {
                setAccents(e.target.checked);
                localStorage.setItem(
                  "flint-ignore-accents",
                  String(e.target.checked),
                );
              }}
            />
          </label>
        </div>
        <UpdateSettings />
        <BackupSettings />
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
          <p>Version {version || "Loading…"} · Local-first study application</p>
        </div>
      </span>
    </div>
  );
}
function BackupSettings() {
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
    const path = await open({
      multiple: false,
      filters: [{ name: "Flint backup", extensions: ["flintbackup"] }],
    });
    if (typeof path === "string") {
      await restoreBackup(path);
      setStatus("Backup restored. Restart Flint to load it.");
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
        <button onClick={exportAll}>Export entire library</button>
        <button onClick={restore}>Restore backup</button>
      </div>
    </div>
  );
}
