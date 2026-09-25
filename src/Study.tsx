import { VideoPlayer } from "./Video";
import { confidenceGrade } from "./confidence";
import { useStudyMediaSize } from "./media-layout";
import { AnswerMark } from "./AnswerMark";
import { readPreference, writePreference } from "./preferences";
import { SingleCardEditor } from "./SingleCardEditor";
import { StudyScope } from "./StudyScope";
import { useEffect, useRef, useState } from "react";
import { Deck, isValidCardDraft } from "./lib";
import { AnswerInput, CanonicalAnswer } from "./AnswerInput";
import { StructuredView } from "./StructuredView";
import { MathText } from "./MathText";
import { parseStructuredUnit, structuredTargets, structuredSignature, structuredUnitId, type Target } from "./structured";
import { structuredAnswers } from "./test-engine";
import { learnIds } from "./learn-engine";
import { editableTarget } from "./editing";
import { AudioPlayer } from "./Audio";
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
  learnComplete,
  answerLearn,
  continueWave,
  grade,
  learnProgress,
  shuffle,
  shuffleLearn,
  structuredLearnGroup,
  answerLearnGroup,
  prepareLearnChoices,
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
  audio,
  video,
  autoplay = false,
  active = true,
  mode = "study",
}: {
  name?: string | null;
  alt: string;
  audio?: string | null;
  video?: string | null;
  autoplay?: boolean;
  active?: boolean;
  mode?: "study"|"choice"|"preview";
}) {
  const [src, setSrc] = useState(""),
    [imageError, setImageError] = useState(false);
  const [dimensions,setDimensions]=useState({src:"",width:0,height:0});
  const imageRef=useRef<HTMLImageElement>(null);
  const size=useStudyMediaSize(imageRef,dimensions.src===src?dimensions.width:0,dimensions.src===src?dimensions.height:0,"image",undefined,mode);
  useEffect(() => {
    let active = true;
    setSrc("");
    setImageError(false);
    mediaUrl(name)
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setImageError(true);
      });
    return () => {
      active = false;
    };
  }, [name]);
  return (
    <>
      {name && !src && (
        <span className="media-placeholder">
          {imageError ? "Image unavailable" : "Loading image…"}
        </span>
      )}
      {src && (
        <img
          ref={imageRef}
          className="study-image"
          src={src}
          alt={alt}
          style={size?{width:size.width,height:"auto"}:undefined}
          onLoad={e=>setDimensions({src,width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})}
          onError={() => {
            setSrc("");
            setImageError(true);
          }}
        />
      )}
      <VideoPlayer
        mode={mode}
        name={video}
        active={active}
        autoplay={autoplay}
        label={alt + " video"}
      />
      <AudioPlayer
        name={audio}
        autoplay={autoplay && !video}
        label={alt.replace("visual", "audio") || "Audio"}
        active={active}
      />
    </>
  );
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
  const [editingCard, setEditingCard] = useState<Deck["cards"][number] | null>(
    null,
  );
  const due = deck.cards.filter(
    (c) => !c.dueAt || new Date(c.dueAt) <= new Date(),
  ).length;
  const mastered = deck.cards.filter((c) => c.status === "Mastered").length;
  return (
    <div className="set-overview">
      {editingCard && actions?.saveCard && (
        <SingleCardEditor
          card={editingCard}
          starred={!!deck.meta?.starredCards?.includes(editingCard.id)}
          close={() => setEditingCard(null)}
          save={(card, starred) => actions.saveCard!(deck.id, card, starred)}
        />
      )}
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
            {deck.meta?.sharedFlint && (
              <small
                className="flint-source"
                title="Imported from a shared Flint set"
              >
                .flint
              </small>
            )}
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
      </div>
      <div className="set-card-list">
        <h2>Cards in this set</h2>
        {deck.cards.map((card, index) => ({card,index})).sort((a,b) => Number(!!deck.meta?.starredCards?.includes(b.card.id))-Number(!!deck.meta?.starredCards?.includes(a.card.id))).map(({card,index}) => (
          <div key={card.id}>
            <small>{String(index + 1).padStart(2, "0")}</small>
            <section className="term-copy">
              {card.structure ? <StructuredView value={card.structure} mode="reference"/> : <>
              <p><MathText text={card.question}/></p>
              <StudyImage
                name={card.questionImage}
                audio={card.questionAudio}
                video={card.questionVideo}
                alt="Question"
              />
              <p><MathText text={card.answer}/></p>
              <StudyImage
                name={card.answerImage}
                audio={card.answerAudio}
                video={card.answerVideo}
                alt="Answer"
              />
              </>}
            </section>
            <div className="term-actions">
              <button
                className="icon"
                aria-label={"Edit card " + (index + 1)}
                onClick={() => setEditingCard(card)}
                disabled={!actions?.saveCard}
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

function FlashcardsSession({ deck, done }: { deck: Deck; done: () => void }) {
  const [cards, setCards] = useState(() => readPreference("shuffle-new", false) ? shuffle(deck.cards) : deck.cards),
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
    if (cards[indexRef.current]?.structure) return;
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
          {cards[index].structure ? <StructuredView value={cards[index].structure!} mode="reference" /> : <>
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
            <div className="viewer-face" aria-hidden={flipped} inert={flipped}>
              <small>FRONT</small>
              <StudyImage
                name={side.image}
                audio={side.audio}
                video={side.video}
                active={!flipped}
                autoplay
                alt="Front visual"
              />
              <h1><MathText text={side.prompt}/></h1>
            </div>
            <div
              className="viewer-face viewer-back"
              aria-hidden={!flipped}
              inert={!flipped}
            >
              <small>BACK</small>
              <StudyImage
                name={side.answerImage}
                audio={side.answerAudio}
                video={side.answerVideo}
                active={flipped}
                autoplay
                alt="Back visual"
              />
              <h1><MathText text={side.answer}/></h1>
            </div>
          </div>
          </>}
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
          {cards[index].structure ? "Complete reference · use arrows to navigate" : "Click, Space, ↑ or ↓ to flip"}
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
            <option value="terms">Front</option>
            <option value="definitions">Back</option>
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

function WaveLearnSession({
  deck,
  done,
  accents,
}: {
  deck: Deck;
  done: () => void;
  accents: boolean;
}) {
  const [state, setState] = useState<WaveState | null>(null),
    [loaded, setLoaded] = useState(false),
    [started, setStarted] = useState(false);
  const [options, setOptions] = useState<LearnOptions>(() => ({...defaultOptions,
    confidence:readPreference("learn-confidence",true),
    choice:readPreference("learn-choice",true),typed:readPreference("learn-typed",true),
    grading:readPreference("learn-strict",false)?"strict":"normal"})),
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
    result: "CORRECT" | "CLOSE" | "INCORRECT" | "DIDNT_KNOW";
    saved: boolean;
    targets?: Target[];
    targetResults?: Record<string,boolean>;
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
  const sessionKey = "learn-waves-v1-" + deck.cards.map((c) => c.id + (c.structure ? structuredSignature(c.structure) : "")).join("_");
  useEffect(() => {
    loadStudySession<WaveState>(deck.id, sessionKey)
      .then(async (saved) => {
        if (
          saved?.version === 1 &&
          [...saved.ids].sort().join() === learnIds(deck.cards).sort().join()
        ) {
          if (learnComplete(saved)) {
            await saveStudySession(
              deck.id,
              sessionKey + "-history-" + crypto.randomUUID(),
              saved,
            );
          } else {
            const prepared=prepareLearnChoices({...saved,phase:saved.phase || "learning",options:{...saved.options,reinforcement:true}},deck.cards);
            await saveStudySession(deck.id,sessionKey,prepared);
            setState(prepared);
          }
          setOptions({...saved.options,reinforcement:true});
        }
        setLoaded(true);
      })
      .catch(() => {
        setError("Could not load Learn progress. Reopen this set to retry.");
      });
  }, [deck.id]);
  const commit = async (next: WaveState) => {
    next=prepareLearnChoices(next,deck.cards);
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
  const restartLearn = async (randomize=false) => {
    if(saving || lock.current)return;
    if(state && (state.introduced > state.wave.length || state.rounds > 0 || Object.values(state.mastery).some(v=>v!=="New")) && !window.confirm("Restart learning? This resets this Learn run, not your saved cards or review history."))return;
    lock.current=true;
    const fresh=beginLearn(randomize ? shuffle(deck.cards) : deck.cards,options);
    if(await commit(randomize ? shuffleLearn(fresh) : fresh)){setResponse(null);setPhase(false);setUser("");setStarted(true);}
    lock.current=false;
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
    if (
      !response?.saved ||
      response.result === "DIDNT_KNOW" ||
      response.result === "CLOSE"
    )
      return;
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
      if (response?.saved && e.key === "Enter") {
        e.preventDefault();
        dismissFeedback();
        return;
      }
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
    card = response?.card || deck.cards.find((c) => c.id === (parseStructuredUnit(question?.cardId || "")?.[0] || question?.cardId));
  const target = card?.structure ? structuredTargets(card.structure).find(t => t.id === parseStructuredUnit(question?.cardId || "")?.[1]) : undefined;
  const side = card && question ? sides(card, question.reverse) : null;
  const choices = useRef<string[]>([]),
    choiceKey = useRef("");
  const signature = question
    ? `${question.cardId}-${question.kind}-${state?.rounds}-${question.reverse}`
    : "";
  const groupCache=useRef<{signature:string;targets:Target[]}>({signature:"",targets:[]});
  if(groupCache.current.signature!==signature && card && state)groupCache.current={signature,targets:structuredLearnGroup(card,state)};
  const group=response?.targets || groupCache.current.targets;
  const structuredValues=group.length>1 ? structuredAnswers(response?.user ?? user) : target ? {[target.id]:response?.user ?? user} : {};
  useEffect(
    () => () => {
      window.dispatchEvent(new CustomEvent("flint-audio-play"));
    },
    [signature],
  );
  if (card && question && signature !== choiceKey.current) {
    const distractors = shuffle(
      deck.cards.filter(
        (c) =>
          c.id !== card.id && !c.structure &&
          (sides(c, question.reverse).answer.trim() ||
            sides(c, question.reverse).answerImage ||
            sides(c, question.reverse).answerAudio ||
            sides(c, question.reverse).answerVideo),
      ),
    ).slice(0, 3);
    choices.current = question.choices || shuffle([card.id, ...distractors.map((c) => c.id)]);
    choiceKey.current = signature;
  }
  const answer = async (
    value: string,
    selectedId?: string,
    visualRecall?: boolean,
    didntKnow = false,
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
      !didntKnow &&
      visualRecall === undefined &&
      !value.trim()
    )
      return;
    window.dispatchEvent(new CustomEvent("flint-audio-play"));
    if(target && !didntKnow && group.some(t=>!structuredValues[t.id]?.trim()))return;
    lock.current = true;
    const evidence=!didntKnow && question.kind==="typed" && visualRecall===undefined && options.confidence ? confidenceGrade(value,side.answer,options.grading==="strict",accents) : undefined;
    const targetEvidence=target && !didntKnow && question.kind==="typed" && options.confidence ? Object.fromEntries(group.map(t=>[structuredUnitId(card.id,t.id),confidenceGrade(structuredValues[t.id]||"",t.answer,options.grading==="strict",accents)])) : {};
    const targetResults=target ? Object.fromEntries(group.map(t=>[t.id,!didntKnow && (targetEvidence[structuredUnitId(card.id,t.id)] ? targetEvidence[structuredUnitId(card.id,t.id)].accuracy>=.7 : grade(structuredValues[t.id] || "",t.answer,options.grading,accents)!=="INCORRECT")])) : undefined;
    const result = didntKnow
      ? "DIDNT_KNOW"
      : visualRecall !== undefined
        ? visualRecall
          ? "CORRECT"
          : "INCORRECT"
        : target ? Object.values(targetResults!).every(Boolean) ? "CORRECT" : "INCORRECT"
        : question.kind === "choice"
          ? selectedId === card.id
            ? "CORRECT"
            : "INCORRECT"
          : evidence ? evidence.result==="strong_correct"?"CORRECT":evidence.result==="accepted"?"CLOSE":"INCORRECT" : grade(value, side.answer, options.grading, accents);
    const ok = result === "CORRECT" || result === "CLOSE";
    const display = {
      question,
      card,
      choices: [...choices.current],
      user: value,
      selected: selectedId,
      result: result as "CORRECT" | "CLOSE" | "INCORRECT" | "DIDNT_KNOW",
      saved: false,
      targets:target ? group : undefined,
      targetResults,
    };
    setResponse(display);
    setFeedback(
      didntKnow
        ? "Didn't know — let's learn it"
        : evidence?.result === "borderline" ? "Almost — we'll review this again"
        : result === "CLOSE" || Object.values(targetEvidence).some(e=>e.needsReview) && ok
          ? "Correct enough — we'll review this again"
          : ok
            ? "Correct"
            : "Not quite",
    );
    const next=target ? answerLearnGroup(state,Object.fromEntries(group.map(t=>[structuredUnitId(card.id,t.id),didntKnow ? "DIDNT_KNOW" as const : !!targetResults?.[t.id]])),targetEvidence,Object.fromEntries(group.map(t=>[structuredUnitId(card.id,t.id),structuredValues[t.id]||""]))) : answerLearn(state, didntKnow ? "DIDNT_KNOW" : ok,value,evidence);
    if (await commit(next)) {
      setResponse({ ...display, saved: true });
      try {
        await reviewNative(
          card,
          didntKnow ? "Didn't Know" : ok ? "Good" : "Again",
          ok,
          0,
          value,
        );
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        editableTarget(e.target) ||
        document.querySelector("dialog[open]") ||
        !started ||
        response ||
        phase ||
        state?.checkpoint ||
        question?.kind !== "choice" || !!card?.structure
      )
        return;
      const index = Number(e.key) - 1;
      if (index < 0 || index > 3 || !Number.isInteger(index)) return;
      const selected = deck.cards.find((c) => c.id === choices.current[index]);
      if (selected && question) {
        e.preventDefault();
        void answer(sides(selected, question.reverse).answer, selected.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [started, response, phase, state, signature]);
  // Keep the submitted question visible until its persistence and feedback finish.
  return (
    <div className="learn-session">
      <div className="session-heading">
        <Back done={done} />
        <span>{deck.title} · Learn</span>
        {state && <details className="learn-actions"><summary>Session actions</summary><button disabled={saving || !!response} onClick={()=>void restartLearn()}>Restart</button><button disabled={saving || !!response} onClick={()=>void commit(shuffleLearn(state))}>Shuffle</button><button disabled={saving || !!response} onClick={()=>void restartLearn(true)}>Restart &amp; Shuffle</button></details>}
      </div>
      {error && <p role="alert">{error}</p>}
      {!loaded ? (
        <p>Loading progress…</p>
      ) : !started ? (
        <div className="learn-start">
          <p className="eyebrow">LEARN</p>
          <h1>{state ? "Continue learning?" : "Memorize this set"}</h1>
          <p>Recognize a few terms, then recall those same ideas.</p>
          <button
            className="primary"
            disabled={saving || !deck.cards.length}
            onClick={async () => {
              if (state || (await commit(beginLearn(readPreference("shuffle-new", false) ? shuffle(deck.cards) : deck.cards, options))))
                setStarted(true);
            }}
          >
            {state ? "Resume" : "Start"}
          </button>
          {!state && (
            <details>
              <summary>Learn options</summary>
              <fieldset><legend>Question types</legend>
                <label><input type="checkbox" checked={options.choice!==false} disabled={options.typed===false} onChange={e=>{setOptions({...options,choice:e.target.checked});writePreference("learn-choice",e.target.checked);}}/>Multiple Choice</label>
                <label><input type="checkbox" checked={options.typed!==false} disabled={options.choice===false} onChange={e=>{setOptions({...options,typed:e.target.checked});writePreference("learn-typed",e.target.checked);}}/>Typed Answer</label>
              </fieldset>
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
                  <option value="terms">Front</option>
                  <option value="definitions">Back</option>
                  <option value="mixed">Both</option>
                </select>
              </label>
              <label>
                Grading{" "}
                <select
                  value={options.grading}
                  onChange={(e) => {
                    writePreference("learn-strict",e.target.value === "strict");
                    setOptions({
                      ...options,
                      grading: e.target.value as LearnOptions["grading"],
                    });
                  }}
                >
                  <option value="normal">Flexible</option>
                  <option value="strict">Word-for-word (strict)</option>
                  <option value="lenient">Lenient</option>
                </select>
              </label>
              <label><input type="checkbox" checked={options.confidence??false} disabled={options.grading==="strict"} onChange={e=>{writePreference("learn-confidence",e.target.checked);setOptions({...options,confidence:e.target.checked});}}/> Confidence grading</label>
              <small>Accept sufficiently complete near-matches and revisit imperfect answers. Word-for-word remains strict.</small>
            </details>
          )}
        </div>
      ) : (
        state && (
          <>
            {state.phase==="weak" && <p className="eyebrow">WEAK CARDS · Reinforcement {state.reinforcement?.section} of {state.reinforcement?.total}</p>}
            <div className="learn-progress">
              <span>Overall learning</span>
              <b>{learnProgress(state)}%</b>
              <Progress
                label="Overall deck learning"
                value={learnProgress(state)}
              />
            </div>
            <div className="wave-progress">
              {(["choice", "typed"] as const).filter(kind=>state.options[kind]!==false).map((kind) => {
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
                <p className="eyebrow">{state.phase==="weak" ? `WEAK CARDS · Reinforcement ${state.reinforcement?.section} of ${state.reinforcement?.total}` : "CHECKPOINT"}</p>
                <h1>{state.phase==="learning" && state.introduced===state.ids.length && state.ids.some(id=>state.mistakes[id]>0 || state.reviewNeeded?.[id]) ? `Nice work — let's strengthen ${state.ids.filter(id=>state.mistakes[id]>0 || state.reviewNeeded?.[id]).length} targets.` : "Nice work"}</h1>
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
                <h1>Learn complete</h1>
                <p>{deck.cards.length} cards studied · {state.ids.filter(id=>state.mastery[id]==="Mastered").length} strong targets · {state.reinforcement?.ids.length || 0} reinforced</p>
                <p>
                  {state.ids.every((id) => state.mastery[id] === "Mastered")
                    ? "Every term passed typed recall."
                    : "You've practiced this set. Some terms need more work — come back for a fresh session."}
                </p>
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
                      ? response.result === "INCORRECT" ||
                        response.result === "DIDNT_KNOW"
                        ? "answer-wrong"
                        : "answer-correct"
                      : "")
                  }
                >
                  <small>
                    {question.kind === "choice" ? "RECOGNIZE" : "RECALL"} · Wave{" "}
                    {state.rounds + 1}
                  </small>
                  {card.structure && target ? <>
                    <StructuredView key={signature} value={card.structure} mode={question.kind === "choice" ? "choice" : "typed"} targetIds={group.map(t=>t.id)} answers={structuredValues} onAnswer={(id,value) => setUser(group.length>1 ? JSON.stringify({...structuredValues,[id]:value}) : value)} results={response?.targetResults} onSubmit={() => response ? dismissFeedback() : void answer(user)} />
                  </> : <>
                  <h1><MathText text={side.prompt}/></h1>
                  <StudyImage
                    name={side.image}
                    key={signature}
                    audio={side.audio}
                    video={side.video}
                    autoplay
                    active={!response && !saving}
                    alt="Question visual"
                  />
                  {question.kind === "choice" ? (
                    <div className="choice-grid">
                      {(response?.choices || choices.current).map((id) => {
                        const item = deck.cards.find((c) => c.id === id)!;
                        const choice = sides(item, question.reverse);
                        return (
                          <div className="choice-with-audio" key={id}>
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
                              aria-label={
                                choice.answer ||
                                `Choose ${choice.answerVideo ? "video" : choice.answerAudio ? "audio" : "image"} answer ${choices.current.indexOf(id) + 1}`
                              }
                            >
                              <kbd aria-hidden="true" className="choice-number">{choices.current.indexOf(id)+1}</kbd>
                              {choice.answer.trim() ? <MathText text={choice.answer}/> :
                                (!choice.answerImage
                                  ? choice.answerVideo
                                    ? "Select this video answer"
                                    : choice.answerAudio
                                      ? "Select this audio answer"
                                      : "Answer unavailable"
                                  : "")}
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
                            <VideoPlayer
                              mode="choice"
                              name={choice.answerVideo}
                              label="Choice video"
                            />
                            <AudioPlayer
                              name={choice.answerAudio}
                              label={
                                "Choice " + (choices.current.indexOf(id) + 1)
                              }
                            />
                          </div>
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
                      <AnswerInput
                        cards={deck.cards}
                        autoFocus
                        readOnly={!!response}
                        key={signature}
                        aria-label="Your answer"
                        placeholder="Type your answer"
                        value={user}
                        onValue={setUser}
                      />
                    </form>
                  ) : (
                    <div>
                      <p>
                        Recall the answer, then reveal it and check yourself.
                      </p>
                      <details key={signature}>
                        <summary>Reveal answer media</summary>
                        <StudyImage
                          name={side.answerImage}
                          audio={side.answerAudio}
                          video={side.answerVideo}
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
                  </>}
                  {!response && (
                    <div className="learn-question-actions">
                    <button
                      className="secondary learn-skip"
                      disabled={saving}
                      onClick={() => answer("", undefined, undefined, true)}
                    >
                      I don't know
                    </button>
                    {(card.structure || (question.kind==="typed" && side.answer)) && <button className="primary" disabled={saving || (card.structure ? group.some(t=>!structuredValues[t.id]?.trim()) : !user.trim())} onClick={()=>void answer(user)}>{card.structure&&group.length>1?"Check answers":"Check answer"}</button>}
                    </div>
                  )}
                  <DeferredLoading busy={saving} label="Saving progress" />
                  {response && (
                    <div
                      className={
                        "answer-feedback " +
                        (response.result === "INCORRECT" ||
                        response.result === "DIDNT_KNOW"
                          ? "wrong"
                          : "")
                      }
                      role="status"
                    >
                      <strong>
                        <AnswerMark correct={response.result!=="DIDNT_KNOW"&&response.result!=="INCORRECT"}/>
                        {feedback}
                      </strong>
                      {!card.structure && response.result === "CLOSE" && (
                        <CanonicalAnswer answer={side.answer} />
                      )}
                      {!card.structure && response.result === "DIDNT_KNOW" && (
                        <>
                          <CanonicalAnswer answer={side.answer} />
                          <StudyImage
                            name={side.answerImage}
                            audio={side.answerAudio}
                            video={side.answerVideo}
                            alt="Correct answer visual"
                          />
                          <p>
                            We'll practice recognition before recall. After
                            three skips, take a break and revisit this term in a
                            fresh session.
                          </p>
                        </>
                      )}
                      {!card.structure && response.result === "INCORRECT" && (
                        <>
                          <p>Your answer: {response.user || "Image choice"}</p>
                          <div className="expected-answer">
                            Correct answer: {side.answer}
                            <StudyImage
                              name={side.answerImage}
                              audio={side.answerAudio}
                              video={side.answerVideo}
                              alt="Correct answer visual"
                            />
                          </div>
                          <small>{state.phase==="weak" && state.reinforcement?.section===state.reinforcement?.total ? "This target still needs practice." : "You'll see this one again."}</small>
                        </>
                      )}
                      {(response.result === "CORRECT" ||
                        response.result === "CLOSE") &&
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
export function Flashcards(props: { deck: Deck; done: () => void }) {
  return (
    <StudyScope {...props} mode="Flashcards">
      {(deck) => <FlashcardsSession deck={deck} done={props.done} />}
    </StudyScope>
  );
}
export function WaveLearn(props: { deck: Deck; done: () => void }) {
  return (
    <StudyScope
      {...props}
      mode="Learn"
      deck={{
        ...props.deck,
        cards: props.deck.cards.filter(isValidCardDraft),
      }}
    >
      {(deck, accents) => (
        <WaveLearnSession deck={deck} done={props.done} accents={accents} />
      )}
    </StudyScope>
  );
}
