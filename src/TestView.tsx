import { StudyScope } from "./StudyScope";
import { useMemo, useRef, useState } from "react";
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
  const missing = (questions || []).filter((q) =>
    (q.matchRows || [q]).some((row) => !answers[row.card.id]?.trim()),
  );
  const questionCorrect = (q: TestQuestion) =>
    (q.matchRows || [q]).every((row) => testCorrect(row, answers[row.card.id]));
  const correct = (questions || []).filter(questionCorrect);
  const jump = (id: string) => {
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
          user: testAnswer(q, answers[q.card.id]),
          correct: testCorrect(q, answers[q.card.id]),
          flagged: questions.some(
            (group) =>
              flags.includes(group.card.id) &&
              (group.matchRows || [group]).some(
                (row) => row.card.id === q.card.id,
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
              Find out what has stayed with you.
              <br />A fixed worksheet, at your own pace.
            </p>
          </div>
          <div className="config-fields">
            <label>
              Questions requested
              <input
                aria-label="Number of questions"
                type="number"
                min={1}
                max={deck.cards.length}
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
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={kinds.includes(kind)}
                    onChange={() =>
                      setKinds((old) =>
                        old.includes(kind)
                          ? old.filter((k) => k !== kind)
                          : [...old, kind],
                      )
                    }
                  />
                  {testLabels[kind]}
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
                count > deck.cards.length ||
                !kinds.length
              }
              onClick={() => {
                const generated = makeTest(deck.cards, count, kinds, direction);
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
                          .filter((q) => !testCorrect(q, answers[q.card.id]))
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
                  onClick={() => jump(questions[0].card.id)}
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
                const id = q.card.id,
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
                          : q.prompt}
                      </h2>
                      {!q.matchRows && (
                        <StudyImage
                          name={q.promptImage}
                          audio={q.promptAudio}
                          alt="Question visual"
                        />
                      )}
                      {q.kind === "written" ? (
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
                            {q.claim}
                            <StudyImage
                              name={q.claimImage}
                              audio={q.claimAudio}
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
                        <fieldset disabled={show || saving}>
                          {q.choices.map((c) => (
                            <label key={c.id}>
                              <input
                                type="radio"
                                name={id}
                                checked={answers[id] === c.id}
                                onChange={() => update(id, c.id)}
                              />
                              {c.text}
                              <StudyImage
                                name={c.image}
                                audio={c.audio}
                                alt="Answer choice visual"
                              />
                            </label>
                          ))}
                        </fieldset>
                      )}
                      {instant && !show && q.kind !== "matching" && (
                        <button
                          className="secondary"
                          disabled={!answers[id]?.trim() || saving}
                          onClick={() => setChecked((old) => [...old, id])}
                        >
                          Check answer
                        </button>
                      )}
                      {show && q.kind !== "matching" && (
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
                    key={q.card.id}
                    aria-label={"Go to question " + (i + 1)}
                    aria-current={current === q.card.id ? "step" : undefined}
                    className={
                      (answers[q.card.id]?.trim() ? "answered " : "") +
                      (flags.includes(q.card.id) ? "flagged" : "")
                    }
                    onClick={() => jump(q.card.id)}
                  >
                    {String(i + 1).padStart(2, "0")}
                    {flags.includes(q.card.id) && <Flag size={9} />}
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
                  jump(missing[0].card.id);
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
