import { editableTarget } from "./editing";
import { MathText } from "./MathText";
import { StructuredView } from "./StructuredView";
import { structuredAnswers, testAnswered, questionId } from "./test-engine";
import { StudyScope } from "./StudyScope";
import { useEffect, useMemo, useRef, useState } from "react";
import { Matching } from "./Matching";
import { AnswerInput, CanonicalAnswer } from "./AnswerInput";
import { gradeAnswer } from "./lib";
import { Flag, Check, ClipboardCheck, RotateCcw } from "lucide-react";
import type { Deck } from "./lib";
import {
  makeTest,
  testCorrect,
  testAnswer,
  testLabels,
  TestKind,
  TestQuestion,
  testRows,
  testAvailability,
} from "./test-engine";
import { recordTestAttempt } from "./native";
import { StudyImage } from "./Study";
import { DeferredLoading, Progress, useReducedMotion } from "./motion";
function TestSession({
  deck,
  done,
  studyMissed,
}: {
  deck: Deck;
  done: () => void;
  studyMissed: (deck: Deck) => void;
}) {
  const [questions, setQuestions] = useState<TestQuestion[] | null>(null),
    [count, setCount] = useState(Math.min(10, deck.cards.length));
  const [kinds, setKinds] = useState<TestKind[]>(["choice", "written"]),
    [direction, setDirection] = useState<"terms" | "definitions" | "both">(
      "definitions",
    ),
    [instant, setInstant] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [flags, setFlags] = useState<string[]>([]),
    [checked, setChecked] = useState<string[]>([]),
    [current, setCurrent] = useState("");
  const [submitted, setSubmitted] = useState(false),
    [warning, setWarning] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    refs = useRef<Record<string, HTMLElement | null>>({}),
    scoreRef = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion();
  const rows = useMemo(() => testRows(questions || []), [questions]);
  const available=useMemo(()=>testAvailability(deck.cards),[deck.cards]);
  const planned=useMemo(()=>makeTest(deck.cards,count,kinds.filter(kind=>available[kind]),direction),[deck.cards,count,kinds,direction,available]);
  const typeDescriptions:Record<TestKind,string>={choice:"Choose from answer options.",written:"Type answers, including missing table cells and diagram labels.",boolean:"Decide whether a statement is true or false.",matching:"Arrange compatible term/definition pairs."};
  const unavailableReasons:Record<TestKind,string>={choice:"Multiple choice needs at least two distinct compatible normal cards.",written:"Written needs valid cards with answer text or structured targets.",boolean:"True / False needs at least one compatible normal card.",matching:"Matching is unavailable because these cards don't contain enough compatible term/definition pairs (at least three distinct pairs)."};
  const missing = (questions || []).filter((q) =>
    (q.matchRows || [q]).some((row) => !testAnswered(row,answers[questionId(row)])),
  );
  const questionCorrect = (q: TestQuestion) =>
    (q.matchRows || [q]).every((row) => testCorrect(row, answers[questionId(row)]));
  const correct = (questions || []).filter(questionCorrect);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        editableTarget(e.target) ||
        submitted ||
        saving ||
        !/^[1-4]$/.test(e.key)
      )
        return;
      const visible = (questions || []).filter((q) => {
        const r = refs.current[questionId(q)]?.getBoundingClientRect();
        return q.kind === "choice" && r && r.bottom > 0 && r.top < innerHeight;
      });
      const q = visible.find((q) => questionId(q) === current) || visible[0];
      const choice = q?.choices[Number(e.key) - 1];
      if (q && choice && !checked.includes(questionId(q))) {
        e.preventDefault();
        update(questionId(q), choice.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [questions, current, submitted, saving, checked]);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("flint-audio-play"));
  }, [current]);
  const jump = (id: string) => {
    window.dispatchEvent(new CustomEvent("flint-audio-play"));

    const group = questions?.find((q) =>
      q.matchRows?.some((row) => row.card.id === id),
    );
    const el = refs.current[group?.card.id || id];
    el?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
    (
      (el?.querySelector("input,select,.drag-handle") ||
        el?.querySelector("button")) as HTMLElement | null
    )?.focus({
      preventScroll: true,
    });
    setCurrent(id);
  };
  const submit = async (force = false) => {
    if (!questions || lock.current || submitted) return;
    if (missing.length && !force) {
      setWarning(true);
      return;
    }
    window.dispatchEvent(new CustomEvent("flint-audio-play"));
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      await recordTestAttempt(
        deck.id,
        correct.length,
        questions.length,
        rows.map((q) => ({
          cardId: q.card.id,
          kind: q.kind,
          question: q.prompt,
          answer: q.answer,
          user: testAnswer(q, answers[questionId(q)]),
          correct: testCorrect(q, answers[questionId(q)]),
          flagged: questions.some(
            (group) =>
              flags.includes(questionId(group)) &&
              (group.matchRows || [group]).some(
                (row) => questionId(row) === questionId(q),
              ),
          ),
        })),
      );
      setSubmitted(true);
      setWarning(false);
      requestAnimationFrame(() => {
        scoreRef.current?.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start",
        });
        scoreRef.current?.focus({ preventScroll: true });
      });
    } catch {
      setError(
        "Could not save test results. Your answers are preserved; try submitting again.",
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const update = (id: string, value: string) => {
    setAnswers((old) => ({ ...old, [id]: value }));
    setCurrent(id);
  };
  return (
    <div className="worksheet exam">
      <div className="session-heading">
        <button className="secondary" onClick={done}>
          ← Back to set
        </button>
        <span>{deck.title} · Test</span>
        {questions && (
          <b>
            {questions.length - missing.length} / {questions.length}{" "}
            {questions.length === 1 ? "question" : "questions"} answered
          </b>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {!questions ? (
        <div className="test-config">
          <div className="config-intro">
            <ClipboardCheck size={30} />
            <p className="eyebrow">A QUIET CHALLENGE</p>
            <h1>Create a test</h1>
            <p>
              Choose how you want to practice. Your test uses the cards selected for this session.
            </p>
            <section className="test-plan" aria-label="Test summary"><b>{planned.length} questions</b><p>{deck.cards.length} selected cards</p><ul>{(Object.keys(testLabels) as TestKind[]).filter(kind=>planned.some(q=>q.kind===kind)).map(kind=><li key={kind}><span>{testLabels[kind]}</span><strong>{planned.filter(q=>q.kind===kind).length}</strong></li>)}</ul><small>{instant?"Check answers as you go.":"Answers stay hidden until submission."}</small>{planned.length<count&&<p>Fewer unique questions are available with these cards and settings.</p>}</section>
          </div>
          <div className="config-fields">
            <label>
              Questions requested
              <input
                aria-label="Number of questions"
                type="number"
                min={1}
                max={deck.cards.reduce((n,c)=>n+(c.structure ? 10 : 1),0)}
                value={count}
                onChange={(e) => setCount(+e.target.value)}
              />
            </label>
            <p>
              Matching uses several cards per question. Each matching board
              counts as one question.
            </p>
            <fieldset>
              <legend>Question types</legend>
              {(Object.keys(testLabels) as TestKind[]).map((kind) => (
                <label key={kind} className="test-type-option" aria-disabled={!available[kind]} title={!available[kind] ? unavailableReasons[kind] : typeDescriptions[kind]}>
                  <input
                    aria-label={testLabels[kind]}
                    aria-describedby={`test-kind-${kind}`}
                    type="checkbox"
                    disabled={!available[kind]}
                    checked={available[kind] && kinds.includes(kind)}
                    onChange={() =>
                      setKinds((old) =>
                        old.includes(kind)
                          ? old.filter((k) => k !== kind)
                          : [...old, kind],
                      )
                    }
                  />
                  <span><b>{testLabels[kind]}</b><small id={`test-kind-${kind}`}>{available[kind]?typeDescriptions[kind]:unavailableReasons[kind]}</small></span>
                </label>
              ))}
            </fieldset>
            <label>
              Answer with
              <select
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as typeof direction)
                }
              >
                <option value="definitions">Back</option>
                <option value="terms">Front</option>
                <option value="both">Both</option>
              </select>
            </label>
            <label>
              Feedback
              <select
                value={instant ? "instant" : "end"}
                onChange={(e) => setInstant(e.target.value === "instant")}
              >
                <option value="end">Grade at end</option>
                <option value="instant">Instant feedback</option>
              </select>
            </label>
            <button
              className="primary"
              disabled={
                !Number.isInteger(count) ||
                count < 1 ||
                count > deck.cards.reduce((n,c)=>n+(c.structure ? 10 : 1),0) ||
                !kinds.some(k=>available[k]) || !planned.length
              }
              onClick={() => {
                const generated = planned;
                if (!generated.length) {
                  setError(
                    "Matching needs at least 3 distinct usable pairs. Enable another question type or add cards.",
                  );
                  return;
                }
                setError("");
                setQuestions(generated);
                setAnswers(
                  Object.fromEntries(
                    generated.flatMap(
                      (q) =>
                        q.matchRows?.map((row, i) => [
                          row.card.id,
                          q.initialOrder![i],
                        ]) || [],
                    ),
                  ),
                );
                setFlags([]);
                setChecked([]);
                setSubmitted(false);
              }}
            >
              Generate test
            </button>
          </div>
        </div>
      ) : (
        <>
          <h1>
            {submitted ? "Your results" : "Test"} · {questions.length}{" "}
            {questions.length === 1 ? "question" : "questions"}
          </h1>
          <p>
            {rows.length} {rows.length === 1 ? "card used" : "cards used"} ·
            Each matching board is one question.
          </p>
          {submitted && (
            <div ref={scoreRef} tabIndex={-1} className="test-score">
              <p className="eyebrow">TEST COMPLETE</p>
              <h2>{Math.round((correct.length / questions.length) * 100)}%</h2>
              <p>
                {correct.length} correct · {questions.length - correct.length}{" "}
                incorrect
              </p>
              <p>
                {missing.length} unanswered · {correct.length} /{" "}
                {questions.length} correct
              </p>
              <div className="type-performance">
                {(Object.keys(testLabels) as TestKind[])
                  .filter((kind) => questions.some((q) => q.kind === kind))
                  .map((kind) => {
                    const items = questions.filter((q) => q.kind === kind),
                      right = items.filter(questionCorrect).length;
                    return (
                      <div key={kind}>
                        <span>{testLabels[kind]}</span>
                        <b>
                          {right} / {items.length}
                        </b>
                        <Progress
                          value={(right / items.length) * 100}
                          label={testLabels[kind] + " performance"}
                        />
                      </div>
                    );
                  })}
              </div>
              <div className="button-row">
                {correct.length < questions.length && (
                  <button
                    className="primary"
                    onClick={() =>
                      studyMissed({
                        ...deck,
                        cards: rows
                          .filter((q) => !testCorrect(q, answers[questionId(q)]))
                          .map((q) => q.card),
                      })
                    }
                  >
                    Study missed terms
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => {
                    setQuestions(null);
                    setAnswers({});
                    setWarning(false);
                    setError("");
                  }}
                >
                  <RotateCcw size={16} />
                  Retake test
                </button>
                <button
                  className="secondary"
                  onClick={() => jump(questionId(questions[0]))}
                >
                  Review answers
                </button>
              </div>
              <small>This attempt is saved in your study history.</small>
            </div>
          )}
          <div className="exam-layout">
            <div className="exam-document">
              {questions.map((q, index) => {
                const id = questionId(q),
                  show =
                    submitted ||
                    checked.includes(id) ||
                    (instant && q.kind === "matching" && !!answers[id]),
                  ok = testCorrect(q, answers[id]);
                return (
                  <article
                    className="worksheet-question"
                    key={id}
                    ref={(el) => {
                      refs.current[id] = el;
                    }}
                    tabIndex={-1}
                    onFocus={() => setCurrent(id)}
                  >
                    <div className="question-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="exam-question-content">
                      <div className="exam-question-top">
                        <small>{testLabels[q.kind]}</small>
                        <button
                          className={
                            "flag-button " +
                            (flags.includes(id) ? "selected" : "")
                          }
                          aria-label={"Flag question " + (index + 1)}
                          aria-pressed={flags.includes(id)}
                          onClick={() =>
                            setFlags((old) =>
                              old.includes(id)
                                ? old.filter((x) => x !== id)
                                : [...old, id],
                            )
                          }
                        >
                          <Flag size={15} />
                          <span>
                            {flags.includes(id) ? "Flagged" : "Flag for review"}
                          </span>
                        </button>
                      </div>
                      <h2>
                        {q.matchRows
                          ? `Match ${q.matchRows.length} pairs`
                          : <MathText text={q.prompt}/>}
                      </h2>
                      {!q.matchRows && (
                        <StudyImage
                          name={q.promptImage}
                          audio={q.promptAudio}
                          video={q.promptVideo}
                          alt="Question visual"
                        />
                      )}
                      {q.structuredTargets && q.card.structure ? <StructuredView value={q.card.structure} mode={q.card.structure.type==="occlusion"?"choice":"typed"} targetIds={q.structuredTargets.map(t => t.id)} answers={structuredAnswers(answers[id])} onAnswer={(target,value) => { if (!show && !saving && !checked.includes(id)) update(id,JSON.stringify({...structuredAnswers(answers[id]),[target]:value})); }} results={show || checked.includes(id) ? Object.fromEntries(q.structuredTargets.map(t => [t.id,gradeAnswer(structuredAnswers(answers[id])[t.id] || "",t.answer) !== "INCORRECT"])) : undefined} onSubmit={() => { if (instant && !show && testAnswered(q,answers[id])) setChecked(old => [...old,id]); }} /> : q.kind === "written" ? (
                        <AnswerInput
                          cards={deck.cards}
                          aria-label={"Answer " + (index + 1)}
                          disabled={show || saving}
                          placeholder="Type your answer"
                          value={answers[id] || ""}
                          onValue={(value) => update(id, value)}
                        />
                      ) : q.kind === "matching" ? (
                        <Matching
                          left={q.matchRows!.map((row) => ({
                            id: row.card.id,
                            text: row.prompt,
                            image: row.promptImage,
                            audio: row.promptAudio,
                            video: row.promptVideo,
                          }))}
                          right={q.choices}
                          termFirst={direction !== "terms"}
                          order={q.matchRows!.map(
                            (row) => answers[row.card.id],
                          )}
                          disabled={submitted || saving}
                          reveal={submitted || instant}
                          onChange={(order) => {
                            setAnswers((old) => ({
                              ...old,
                              ...Object.fromEntries(
                                q.matchRows!.map((row, i) => [
                                  row.card.id,
                                  order[i],
                                ]),
                              ),
                            }));
                            setCurrent(id);
                          }}
                        />
                      ) : q.kind === "boolean" ? (
                        <>
                          <div className="truth-claim">
                            <MathText text={q.claim || ""}/>
                            <StudyImage
                              name={q.claimImage}
                              audio={q.claimAudio}
                              video={q.claimVideo}
                              alt="Proposed answer"
                            />
                          </div>
                          <fieldset disabled={show || saving}>
                            {["true", "false"].map((value) => (
                              <label key={value}>
                                <input
                                  type="radio"
                                  name={id}
                                  checked={answers[id] === value}
                                  onChange={() => update(id, value)}
                                />
                                {value === "true" ? "True" : "False"}
                              </label>
                            ))}
                          </fieldset>
                        </>
                      ) : (
                        <fieldset>
                          {q.choices.map((c) => (
                            <div className="test-choice-media" key={c.id}><label>
                              <input
                                type="radio"
                                disabled={show || saving}
                                name={id}
                                checked={answers[id] === c.id}
                                onChange={() => update(id, c.id)}
                              />
                              <MathText text={c.text}/>
                              {!c.text && c.video && <span>Select this video answer</span>}
                            </label>
                              <StudyImage
                                name={c.image}
                                mode="choice"
                                audio={c.audio}
                                video={c.video}
                                alt="Answer choice visual"
                              />
                            </div>
                          ))}
                        </fieldset>
                      )}
                      {instant && !show && q.kind !== "matching" && (
                        <button
                          className="secondary"
                          disabled={!testAnswered(q,answers[id]) || saving}
                          onClick={() => setChecked((old) => [...old, id])}
                        >
                          Check answer
                        </button>
                      )}
                      {show && q.kind !== "matching" && !q.structuredTargets && (
                        <div className={ok ? "result-correct" : "result-wrong"}>
                          <b>
                            {ok
                              ? q.kind === "written" &&
                                gradeAnswer(answers[id], q.answer) === "CLOSE"
                                ? "✓ Close enough"
                                : "✓ Correct"
                              : "✕ Incorrect"}
                          </b>
                          {ok &&
                            q.kind === "written" &&
                            gradeAnswer(answers[id], q.answer) === "CLOSE" && (
                              <CanonicalAnswer answer={q.answer} />
                            )}
                          {!ok && (
                            <>
                              <p>Your answer: {testAnswer(q, answers[id])}</p>
                              <p>
                                Correct answer:{" "}
                                {q.kind === "boolean"
                                  ? (q.truth ? "True" : "False") + " — "
                                  : ""}
                                {q.answer}
                              </p>
                            </>
                          )}
                          <StudyImage
                            name={q.answerImage}
                            audio={q.answerAudio}
                            video={q.answerVideo}
                            alt="Answer visual"
                          />
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="exam-navigator">
              <p className="eyebrow">QUESTION MAP</p>
              <div>
                {questions.map((q, i) => (
                  <button
                    key={questionId(q)}
                    aria-label={"Go to question " + (i + 1)}
                    aria-current={current === questionId(q) ? "step" : undefined}
                    className={
                      (answers[questionId(q)]?.trim() ? "answered " : "") +
                      (flags.includes(questionId(q)) ? "flagged" : "")
                    }
                    onClick={() => jump(questionId(q))}
                  >
                    {String(i + 1).padStart(2, "0")}
                    {flags.includes(questionId(q)) && <Flag size={9} />}
                  </button>
                ))}
              </div>
              <small>
                <Check size={12} /> Filled = answered
                <br />
                <Flag size={12} /> Marked = review later
              </small>
            </div>
          </div>
          {warning && (
            <div className="unanswered" role="alert">
              <p>
                {missing.length}{" "}
                {missing.length === 1 ? "question is" : "questions are"}{" "}
                unanswered.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  jump(questionId(missing[0]));
                  setWarning(false);
                }}
              >
                Go to unanswered
              </button>
              <button
                className="secondary"
                disabled={saving}
                onClick={() => submit(true)}
              >
                Submit anyway
              </button>
            </div>
          )}
          {!submitted && (
            <div className="exam-footer">
              <span>
                {questions.length - missing.length} of {questions.length}{" "}
                {questions.length === 1 ? "question" : "questions"} answered
              </span>
              <DeferredLoading busy={saving} label="Saving result" />
              <button
                className="primary"
                disabled={saving}
                onClick={() => submit()}
              >
                Submit test
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function TestView(props: {
  deck: Deck;
  done: () => void;
  studyMissed: (deck: Deck) => void;
}) {
  return (
    <StudyScope {...props}>
      {(deck) => <TestSession {...props} deck={deck} />}
    </StudyScope>
  );
}
