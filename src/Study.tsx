import { useEffect, useRef, useState } from "react";
import { Deck } from "./lib";
import {
  mediaUrl,
  loadStudySession,
  saveStudySession,
  recordTestAttempt,
  reviewNative,
} from "./native";
import {
  WaveState,
  LearnOptions,
  defaultOptions,
  beginLearn,
  answerLearn,
  continueWave,
  grade,
  learnProgress,
  shuffle,
  sides,
} from "./learn-engine";
import "./study.css";
import { DeferredLoading, Progress, motion, useReducedMotion } from "./motion";
import { SetCover } from "./covers";
import { DeckMenu, SetActions, lastStudied } from "./LibraryView";
import {
  Star,
  Edit3,
  ArrowLeft,
  GraduationCap,
  Layers,
  ClipboardCheck,
  Settings2,
} from "lucide-react";

export function StudyImage({
  name,
  alt,
}: {
  name?: string | null;
  alt: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let active = true;
    setSrc("");
    mediaUrl(name)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc("");
      });
    return () => {
      active = false;
    };
  }, [name]);
  return src ? (
    <img
      className="study-image"
      src={src}
      alt={alt}
      onError={() => setSrc("")}
    />
  ) : null;
}
function Back({ done }: { done: () => void }) {
  return (
    <button className="secondary" onClick={done}>
      ← Back to set
    </button>
  );
}

export function SetOverview({
  deck,
  start,
  edit,
  actions,
  back,
}: {
  deck: Deck;
  start: (
    mode: "learn" | "flashcards" | "test" | "typed" | "word" | "due" | "weak",
  ) => void;
  edit: () => void;
  actions?: SetActions;
  back?: () => void;
}) {
  const due = deck.cards.filter(
    (c) => !c.dueAt || new Date(c.dueAt) <= new Date(),
  ).length;
  const mastered = deck.cards.filter((c) => c.status === "Mastered").length;
  return (
    <div className="set-overview">
      <div className="set-hero">
        <SetCover deck={deck} className="hero-art" />
        <div className="set-hero-bar">
          <button className="secondary" onClick={back}>
            <ArrowLeft size={16} />
            Back to library
          </button>
          {actions && <DeckMenu deck={deck} actions={actions} />}
        </div>
        <div className="set-heading">
          <div className="set-cover">
            <SetCover deck={deck} />
          </div>
          <div>
            <p className="eyebrow">YOUR STUDY SET</p>
            <h1>{deck.title}</h1>
            <p>
              {deck.subject || "Personal set"} · {deck.cards.length} cards
            </p>
            {deck.meta?.description && (
              <p className="set-description">{deck.meta.description}</p>
            )}
            <div className="set-tags">
              {[deck.meta?.folder, ...(deck.meta?.tags || [])]
                .filter(Boolean)
                .map((tag, i) => (
                  <span key={i}>{tag}</span>
                ))}
            </div>
          </div>
          <button className="secondary" onClick={edit}>
            Edit set
          </button>
        </div>
        <div className="set-facts">
          <div>
            <small>LAST STUDIED</small>
            <b>{lastStudied(deck)}</b>
          </div>
          <div>
            <small>MASTERY</small>
            <b>
              {mastered} of {deck.cards.length} cards
            </b>
            <Progress
              value={
                deck.cards.length ? (mastered / deck.cards.length) * 100 : 0
              }
              label="Set mastery"
            />
          </div>
          <div>
            <small>READY TO REVIEW</small>
            <b>{due} due cards</b>
          </div>
        </div>
        <h2>What would you like to do?</h2>
        <div className="primary-modes">
          {(
            [
              ["learn", "Learn", "Build recognition into recall"],
              ["flashcards", "Flashcards", "Review at your own pace"],
              ["test", "Test", "See what you know"],
            ] as const
          ).map(([mode, title, subtitle]) => (
            <button
              disabled={!deck.cards.length}
              key={mode}
              onClick={() => start(mode)}
            >
              <b>
                {mode === "learn" ? (
                  <GraduationCap size={21} />
                ) : mode === "flashcards" ? (
                  <Layers size={21} />
                ) : (
                  <ClipboardCheck size={21} />
                )}{" "}
                {title} →
              </b>
              <span>{subtitle}</span>
            </button>
          ))}
        </div>
        <div className="secondary-modes">
          <button
            className="secondary"
            disabled={!deck.cards.length}
            onClick={() => start("typed")}
          >
            Typed Answer
          </button>
          <button
            className="secondary"
            disabled={!deck.cards.length}
            onClick={() => start("word")}
          >
            Word-for-Word
          </button>
          <button
            className="secondary"
            disabled={!due}
            onClick={() => start("due")}
          >
            Due Cards · {due}
          </button>
          <button
            className="secondary"
            disabled={
              !deck.cards.some(
                (c) =>
                  (c.lapses || 0) > 0 ||
                  ((c.repetitions || 0) > 0 && c.accuracy < 70),
              )
            }
            onClick={() => start("weak")}
          >
            Weak Cards
          </button>
        </div>
      </div>
      <div className="set-card-list">
        <h2>Cards in this set</h2>
        {deck.cards.map((card, index) => (
          <div key={card.id}>
            <small>{String(index + 1).padStart(2, "0")}</small>
            <section className="term-copy">
              <p>{card.question}</p>
              <StudyImage name={card.questionImage} alt="Question" />
              <p>{card.answer}</p>
              <StudyImage name={card.answerImage} alt="Answer" />
            </section>
            <div className="term-actions">
              <button
                className="icon"
                aria-label={"Edit card " + (index + 1)}
                onClick={edit}
              >
                <Edit3 size={16} />
              </button>
              {actions && (
                <button
                  className="icon"
                  aria-label={"Star card " + (index + 1)}
                  aria-pressed={!!deck.meta?.starredCards?.includes(card.id)}
                  onClick={() => {
                    const stars = deck.meta?.starredCards || [];
                    void actions.update({
                      ...deck,
                      meta: {
                        ...deck.meta,
                        starredCards: stars.includes(card.id)
                          ? stars.filter((id) => id !== card.id)
                          : [...stars, card.id],
                      },
                    });
                  }}
                >
                  <Star
                    size={16}
                    fill={
                      deck.meta?.starredCards?.includes(card.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Flashcards({ deck, done }: { deck: Deck; done: () => void }) {
  const [cards, setCards] = useState(deck.cards),
    [index, setIndex] = useState(0),
    [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState("terms");
  const [travel, setTravel] = useState(1),
    [previous, setPrevious] = useState<{
      side: ReturnType<typeof sides>;
      flipped: boolean;
    } | null>(null);
  const indexRef = useRef(index);
  const [flips, setFlips] = useState(0);
  const flip = () => {
    setFlipped((v) => !v);
    setFlips((n) => n + 1);
  };
  indexRef.current = index;
  const reduced = useReducedMotion();
  const move = (delta: number) => {
    const next = Math.max(
      0,
      Math.min(cards.length - 1, indexRef.current + delta),
    );
    if (next === indexRef.current) return;
    setPrevious({
      side: sides(
        cards[indexRef.current],
        direction === "definitions" ||
          (direction === "mixed" && indexRef.current % 2 === 1),
      ),
      flipped,
    });
    setTravel(delta);
    indexRef.current = next;
    setIndex(next);
    setFlipped(false);
  };
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(
      () => setPrevious(null),
      reduced ? 0 : motion.card,
    );
    return () => clearTimeout(timer);
  }, [previous, reduced]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(
          'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
        )
      )
        return;
      if (
        e.code === "Space" &&
        e.target instanceof Element &&
        e.target.closest("button")
      )
        return;
      if (e.code === "Space" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        flip();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        move(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cards, direction, flipped]);
  if (!cards.length) return <Back done={done} />;
  const side = sides(
    cards[index],
    direction === "definitions" || (direction === "mixed" && index % 2 === 1),
  );
  return (
    <div className="viewer">
      <div className="session-heading">
        <Back done={done} />
        <span>{deck.title} · Flashcards</span>
      </div>
      <div className="viewer-counter">
        <p className="viewer-count">
          {index + 1} / {cards.length}
        </p>
        <Progress
          label="Flashcards viewed position"
          value={((index + 1) / cards.length) * 100}
        />
        <p className="viewer-progress-caption">Position in set</p>
      </div>
      <div
        className="viewer-stage"
        style={{ "--travel": `${travel * 32}px` } as React.CSSProperties}
      >
        {previous && (
          <div className="viewer-ghost" aria-hidden="true" inert>
            <div
              className={
                "viewer-card " + (previous.flipped ? "is-flipped" : "")
              }
            >
              <div className="viewer-face">
                <small>FRONT</small>
                <StudyImage name={previous.side.image} alt="" />
                <h1>{previous.side.prompt}</h1>
              </div>
              <div className="viewer-face viewer-back">
                <small>BACK</small>
                <StudyImage name={previous.side.answerImage} alt="" />
                <h1>{previous.side.answer}</h1>
              </div>
            </div>
          </div>
        )}
        <div key={cards[index].id} className={previous ? "viewer-travel" : ""}>
          <div
            className={"viewer-card " + (flipped ? "is-flipped" : "")}
            role="button"
            tabIndex={0}
            aria-label="Flip card"
            onClick={flip}
            onKeyDown={(e) => {
              if (e.key === "Enter") flip();
            }}
          >
            <div className="viewer-face" aria-hidden={flipped}>
              <small>FRONT</small>
              <StudyImage name={side.image} alt="Front visual" />
              <h1>{side.prompt}</h1>
            </div>
            <div className="viewer-face viewer-back" aria-hidden={!flipped}>
              <small>BACK</small>
              <StudyImage name={side.answerImage} alt="Back visual" />
              <h1>{side.answer}</h1>
            </div>
          </div>
        </div>
      </div>
      <div className="viewer-nav">
        <button
          className="secondary"
          aria-label="Previous card"
          disabled={!index}
          onClick={() => move(-1)}
        >
          ←
        </button>
        <span className={flips >= 3 ? "learned-hints" : ""}>
          Click, Space, ↑ or ↓ to flip
        </span>
        <button
          className="secondary"
          aria-label="Next card"
          disabled={index === cards.length - 1}
          onClick={() => move(1)}
        >
          →
        </button>
      </div>
      <div className="study-options">
        <label>
          Show first{" "}
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value);
              setFlipped(false);
            }}
          >
            <option value="terms">Terms</option>
            <option value="definitions">Definitions</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <button
          className="secondary"
          onClick={() => {
            setCards(shuffle(deck.cards));
            setPrevious(null);
            setIndex(0);
            setFlipped(false);
          }}
        >
          Shuffle
        </button>
        <button
          className="secondary"
          onClick={() => {
            setCards(deck.cards);
            setPrevious(null);
            setIndex(0);
            setFlipped(false);
          }}
        >
          Restart
        </button>
      </div>
    </div>
  );
}

export function WaveLearn({ deck, done }: { deck: Deck; done: () => void }) {
  const [state, setState] = useState<WaveState | null>(null),
    [loaded, setLoaded] = useState(false),
    [started, setStarted] = useState(false);
  const [options, setOptions] = useState<LearnOptions>(defaultOptions),
    [user, setUser] = useState("");
  const [feedback, setFeedback] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [response, setResponse] = useState<{
    question: WaveState["queue"][number];
    card: Deck["cards"][number];
    choices: string[];
    user: string;
    selected?: string;
    result: "CORRECT" | "CLOSE" | "INCORRECT";
    saved: boolean;
  } | null>(null);
  const [phase, setPhase] = useState(false);
  const reduced = useReducedMotion();
  const questionElement = useRef<HTMLDivElement>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );
  const sessionKey = "learn-waves-v1-" + deck.cards.map((c) => c.id).join("_");
  useEffect(() => {
    loadStudySession<WaveState>(deck.id, sessionKey)
      .then((saved) => {
        if (
          saved?.version === 1 &&
          saved.ids.join() === deck.cards.map((c) => c.id).join()
        ) {
          setState(saved);
          setOptions(saved.options);
        }
        setLoaded(true);
      })
      .catch(() => {
        setError("Could not load Learn progress. Reopen this set to retry.");
      });
  }, [deck.id]);
  const commit = async (next: WaveState) => {
    setSaving(true);
    setError("");
    try {
      await saveStudySession(deck.id, sessionKey, next);
      setState(next);
      return true;
    } catch {
      setError(
        "Could not save Learn progress. Please retry before continuing.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const nextWave = async () => {
    if (!state || lock.current || response || phase) return;
    lock.current = true;
    await commit(continueWave(state));
    lock.current = false;
  };
  const dismissFeedback = () => {
    if (!response?.saved || saving || exitTimer.current) return;
    questionElement.current?.animate?.(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: reduced ? "none" : "translateY(-5px)" },
      ],
      {
        duration: reduced ? 0 : motion.micro,
        fill: "forwards",
        easing: "cubic-bezier(.2,.7,.2,1)",
      },
    );
    exitTimer.current = setTimeout(
      () => {
        exitTimer.current = null;
        if (
          response.question.kind === "choice" &&
          state?.queue[0]?.kind === "typed"
        )
          setPhase(true);
        setResponse(null);
        setFeedback("");
        setUser("");
      },
      reduced ? 0 : motion.micro,
    );
  };
  useEffect(() => {
    if (!response?.saved) return;
    const timer = setTimeout(
      dismissFeedback,
      response.result === "INCORRECT" ? motion.incorrect : motion.accepted,
    );
    return () => clearTimeout(timer);
  }, [response, saving]);
  useEffect(() => {
    if (!phase) return;
    const timer = setTimeout(() => setPhase(false), motion.phase);
    return () => clearTimeout(timer);
  }, [phase]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !response &&
        !phase &&
        started &&
        state?.checkpoint &&
        (e.key === "Enter" || e.code === "Space") &&
        !(e.target instanceof Element && e.target.closest("button"))
      ) {
        e.preventDefault();
        void nextWave();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [state, started, response, phase]);
  const question = response?.question || state?.queue[0],
    card = response?.card || deck.cards.find((c) => c.id === question?.cardId);
  const side = card && question ? sides(card, question.reverse) : null;
  const choices = useRef<string[]>([]),
    choiceKey = useRef("");
  const signature = question
    ? `${question.cardId}-${question.kind}-${state?.rounds}-${question.reverse}`
    : "";
  if (card && question && signature !== choiceKey.current) {
    const currentAnswer = sides(card, question.reverse);
    const distractors = shuffle(
      deck.cards.filter(
        (c) =>
          c.id !== card.id &&
          (sides(c, question.reverse).answer ||
            sides(c, question.reverse).answerImage),
      ),
    ).slice(0, 3);
    choices.current = shuffle([card.id, ...distractors.map((c) => c.id)]);
    choiceKey.current = signature;
  }
  const answer = async (
    value: string,
    selectedId?: string,
    visualRecall?: boolean,
  ) => {
    if (
      !state ||
      !question ||
      !card ||
      !side ||
      lock.current ||
      feedback ||
      response ||
      phase
    )
      return;
    if (
      question.kind === "typed" &&
      visualRecall === undefined &&
      !value.trim()
    )
      return;
    lock.current = true;
    const result =
      visualRecall !== undefined
        ? visualRecall
          ? "CORRECT"
          : "INCORRECT"
        : question.kind === "choice"
          ? selectedId === card.id
            ? "CORRECT"
            : "INCORRECT"
          : grade(value, side.answer, options.grading);
    const ok = result !== "INCORRECT";
    const display = {
      question,
      card,
      choices: [...choices.current],
      user: value,
      selected: selectedId,
      result: result as "CORRECT" | "CLOSE" | "INCORRECT",
      saved: false,
    };
    setResponse(display);
    setFeedback(
      result === "CLOSE" ? "Close enough" : ok ? "Correct" : "Not quite",
    );
    if (await commit(answerLearn(state, ok))) {
      setResponse({ ...display, saved: true });
      try {
        await reviewNative(card, ok ? "Good" : "Again", ok, 0, value);
      } catch {
        setError(
          "Learn progress saved, but the review history could not be updated.",
        );
      }
    } else {
      setResponse(null);
      setFeedback("");
    }
    lock.current = false;
  };
  // Keep the submitted question visible until its persistence and feedback finish.
  return (
    <div className="learn-session">
      <div className="session-heading">
        <Back done={done} />
        <span>{deck.title} · Learn</span>
      </div>
      {error && <p role="alert">{error}</p>}
      {!loaded ? (
        <p>Loading progress…</p>
      ) : !started ? (
        <div className="learn-start">
          <p className="eyebrow">LEARN</p>
          <h1>Memorize this set</h1>
          <p>Recognize a few terms, then recall those same ideas.</p>
          <button
            className="primary"
            disabled={saving || !deck.cards.length}
            onClick={async () => {
              if (state || (await commit(beginLearn(deck.cards, options))))
                setStarted(true);
            }}
          >
            {state ? "Continue Learn" : "Start"}
          </button>
          {!state && (
            <details>
              <summary>Options</summary>
              <label>
                Wave size{" "}
                <select
                  value={options.waveSize}
                  onChange={(e) =>
                    setOptions({ ...options, waveSize: +e.target.value })
                  }
                >
                  {[4, 5, 7, 10].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Answer with{" "}
                <select
                  value={options.direction}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      direction: e.target.value as LearnOptions["direction"],
                    })
                  }
                >
                  <option value="terms">Terms</option>
                  <option value="definitions">Definitions</option>
                  <option value="mixed">Both</option>
                </select>
              </label>
              <label>
                Grading{" "}
                <select
                  value={options.grading}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      grading: e.target.value as LearnOptions["grading"],
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="strict">Strict</option>
                  <option value="lenient">Lenient</option>
                </select>
              </label>
            </details>
          )}
        </div>
      ) : (
        state && (
          <>
            <div className="learn-progress">
              <span>Overall learning</span>
              <b>{learnProgress(state)}%</b>
              <Progress
                label="Overall deck learning"
                value={learnProgress(state)}
              />
            </div>
            <div className="wave-progress">
              {(["choice", "typed"] as const).map((kind) => {
                const completed =
                  state.wave.length -
                  state.queue.filter((q) => q.kind === kind).length;
                return (
                  <div
                    className={
                      "phase-meter " +
                      (question?.kind === kind ? "current" : "")
                    }
                    key={kind}
                  >
                    <span>
                      {kind === "choice" ? "Recognition" : "Recall"}{" "}
                      <small>
                        {completed} / {state.wave.length}
                      </small>
                    </span>
                    <div
                      role="progressbar"
                      aria-label={
                        kind === "choice" ? "Wave recognition" : "Wave recall"
                      }
                      aria-valuemin={0}
                      aria-valuemax={state.wave.length}
                      aria-valuenow={completed}
                    >
                      {state.wave.map((id, i) => (
                        <i
                          key={id}
                          className={i < completed ? "complete" : ""}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {phase ? (
              <div
                className="phase-change"
                role="status"
                onKeyDown={(e) => {
                  if (e.code === "Space" || e.key === "Enter") {
                    e.preventDefault();
                    setPhase(false);
                  }
                }}
              >
                <small>RECOGNITION COMPLETE</small>
                <h2>Now recall them yourself</h2>
                <p>The same concepts, without the choices.</p>
                <button
                  autoFocus
                  className="primary"
                  onClick={() => setPhase(false)}
                >
                  Continue
                </button>
              </div>
            ) : state.checkpoint && !response ? (
              <div className="checkpoint">
                <p className="eyebrow">CHECKPOINT</p>
                <h1>Nice work</h1>
                <p>
                  {state.wave.length} terms practiced ·{" "}
                  {
                    state.wave.filter((id) => state.mastery[id] === "Mastered")
                      .length
                  }{" "}
                  stronger ·{" "}
                  {
                    state.wave.filter((id) => state.mastery[id] !== "Mastered")
                      .length
                  }{" "}
                  need work
                </p>
                <button
                  autoFocus
                  className="primary"
                  disabled={saving}
                  onClick={nextWave}
                >
                  Continue
                </button>
              </div>
            ) : !question && !response ? (
              <div className="checkpoint">
                <h1>Set learned</h1>
                <p>Every term passed typed recall.</p>
                <Back done={done} />
              </div>
            ) : (
              card &&
              question &&
              side && (
                <div
                  ref={questionElement}
                  key={signature}
                  className={
                    "learn-question " +
                    (response
                      ? response.result === "INCORRECT"
                        ? "answer-wrong"
                        : "answer-correct"
                      : "")
                  }
                >
                  <small>
                    {question.kind === "choice" ? "RECOGNIZE" : "RECALL"} · Wave{" "}
                    {state.rounds + 1}
                  </small>
                  <h1>{side.prompt}</h1>
                  <StudyImage name={side.image} alt="Question visual" />
                  {question.kind === "choice" ? (
                    <div className="choice-grid">
                      {(response?.choices || choices.current).map((id) => {
                        const item = deck.cards.find((c) => c.id === id)!;
                        const choice = sides(item, question.reverse);
                        return (
                          <button
                            className={
                              "secondary " +
                              (response?.selected === id ? "selected " : "") +
                              (response && id === card.id
                                ? "answer-correct"
                                : response?.selected === id &&
                                    response.result === "INCORRECT"
                                  ? "answer-wrong"
                                  : "")
                            }
                            disabled={saving || !!response}
                            key={id}
                            onClick={() => answer(choice.answer, id)}
                          >
                            {choice.answer}
                            {response && id === card.id && (
                              <span className="choice-outcome">
                                ✓ Correct answer
                              </span>
                            )}
                            {response?.selected === id &&
                              response.result === "INCORRECT" && (
                                <span className="choice-outcome">
                                  ✕ Your answer
                                </span>
                              )}
                            <StudyImage
                              name={choice.answerImage}
                              alt="Choice visual"
                            />
                          </button>
                        );
                      })}
                    </div>
                  ) : side.answer ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void answer(user);
                      }}
                    >
                      <input
                        autoFocus
                        readOnly={!!response}
                        key={signature}
                        aria-label="Your answer"
                        placeholder="Type your answer"
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                      />
                      <button
                        className="primary"
                        disabled={saving || !!response || !user.trim()}
                      >
                        Check answer
                      </button>
                    </form>
                  ) : (
                    <div>
                      <p>
                        Recall the visual, then reveal it and check yourself.
                      </p>
                      <details key={signature}>
                        <summary>Reveal answer image</summary>
                        <StudyImage
                          name={side.answerImage}
                          alt="Answer visual"
                        />
                        <div className="study-options">
                          <button
                            className="secondary"
                            disabled={saving}
                            onClick={() =>
                              answer("Visual recall: missed", undefined, false)
                            }
                          >
                            Need practice
                          </button>
                          <button
                            className="primary"
                            disabled={saving}
                            onClick={() =>
                              answer(
                                "Visual recall: remembered",
                                undefined,
                                true,
                              )
                            }
                          >
                            I remembered it
                          </button>
                        </div>
                      </details>
                    </div>
                  )}
                  <DeferredLoading busy={saving} label="Saving progress" />
                  {response && (
                    <div
                      className={
                        "answer-feedback " +
                        (response.result === "INCORRECT" ? "wrong" : "")
                      }
                      role="status"
                    >
                      <strong>
                        <span className="feedback-icon" aria-hidden="true">
                          {response.result === "INCORRECT" ? "✕" : "✓"}
                        </span>
                        {feedback}
                      </strong>
                      {response.result === "INCORRECT" && (
                        <>
                          <p>Your answer: {response.user || "Image choice"}</p>
                          <div className="expected-answer">
                            Correct answer: {side.answer}
                            <StudyImage
                              name={side.answerImage}
                              alt="Correct answer visual"
                            />
                          </div>
                          <small>You'll see this one again.</small>
                        </>
                      )}
                      {response.result !== "INCORRECT" &&
                        question.kind === "typed" && (
                          <small className="learned-tag">✓ Learned</small>
                        )}
                      <button
                        className="primary"
                        disabled={!response.saved || saving}
                        onClick={dismissFeedback}
                      >
                        Continue
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </>
        )
      )}
    </div>
  );
}

export { TestView as WorksheetTest } from "./TestView";
