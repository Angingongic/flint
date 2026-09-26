import { Card, isValidCardDraft, gradeAnswer } from "./lib";
import { selectTargets, type Target } from "./structured";
import { shuffle, sides, grade } from "./learn-engine";
export type TestKind = "choice" | "written" | "boolean" | "matching";
export type TestQuestion = {
  id?: string;
  structuredTargets?: Target[];
  card: Card;
  kind: TestKind;
  prompt: string;
  promptImage?: string | null;
  promptAudio?: string | null;
  promptVideo?: string | null;
  answer: string;
  answerImage?: string | null;
  answerAudio?: string | null;
  answerVideo?: string | null;
  choices: {
    id: string;
    text: string;
    image?: string | null;
    audio?: string | null;
    video?: string | null;
  }[];
  claim?: string;
  claimImage?: string | null;
  claimAudio?: string | null;
  claimVideo?: string | null;
  truth?: boolean;
  /** Matching is one question containing independently scored rows. */
  matchRows?: TestQuestion[];
  initialOrder?: string[];
};
const textKey = (text: string) =>
  text.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export function testAvailability(cards: Card[]): Record<TestKind,boolean> {
  const valid=cards.filter(isValidCardDraft), normal=valid.filter(c=>!c.structure);
  return {written:valid.some(c=>c.structure || c.answer.trim() || c.question.trim()),choice:new Set(normal.map(cardKey)).size>=2,boolean:normal.length>0,matching:new Set(normal.map(c=>textKey(c.question)||c.questionImage||c.questionAudio||c.questionVideo)).size>=3 && new Set(normal.map(c=>textKey(c.answer)||c.answerImage||c.answerAudio||c.answerVideo)).size>=3};
}
export const cardKey = (card: Card) =>
  JSON.stringify([
    textKey(card.question),
    textKey(card.answer),
    card.questionImage || "",
    card.answerImage || "",
    card.questionAudio || "",
    card.answerAudio || "",
    card.questionVideo || "",
    card.answerVideo || "",
  ]);
export function matchingGroupSize(
  remaining: number,
  boards = Math.floor(remaining / 3),
): number {
  return remaining < 3 || boards < 1
    ? 0
    : Math.min(6, Math.floor(remaining / boards));
}
export function shuffledAnswerOrder(ids: string[]): string[] {
  const order = shuffle(ids);
  // A coincidentally solved shuffle is not a meaningful starting question.
  if (ids.length > 1 && order.every((id, i) => id === ids[i]))
    order.push(order.shift()!);
  return order;
}
export const testRows = (questions: TestQuestion[]) =>
  questions.flatMap((q) => q.matchRows || [q]);
export function makeTest(
  cards: Card[],
  count: number,
  kinds: TestKind[],
  direction: "terms" | "definitions" | "both",
): TestQuestion[] {
  if (!kinds.length || !Number.isInteger(count) || count < 1) return [];
  if (cards.some(card => card.structure)) {
    if (!kinds.includes("written")) return makeTest(cards.filter(card=>!card.structure),count,kinds,direction);
    const used = new Set<string>();
    const structuredCards = shuffle(cards.filter(card => card.structure && isValidCardDraft(card) && !used.has(card.id) && !!used.add(card.id)));
    const structured: TestQuestion[]=[];
    const masks=new Set<string>();
    for(let round=0;round<40 && structured.length<count;round++) for(const card of structuredCards) {
      if(structured.length>=count)break;
      const targets = selectTargets(card.structure!);
      const id=JSON.stringify([card.id,...targets.map(t=>t.id).sort()]);
      if(!targets.length || masks.has(id))continue;
      masks.add(id);
      structured.push({ id, card, kind:"written", prompt:card.structure!.title || "Complete the missing information", answer:targets.map(t => `${t.label}: ${t.answer}`).join("; "), choices:[], structuredTargets:targets });
    }
    return shuffle([...structured,...makeTest(cards.filter(card => !card.structure),count-structured.length,kinds,direction)]);
  }
  const seen = new Set<string>(),
    ids = new Set<string>();
  const eligible = cards.filter((card) => {
    if (!isValidCardDraft(card)) return false;
    const key = cardKey(card);
    if (seen.has(key) || ids.has(card.id)) return false;
    seen.add(key);
    ids.add(card.id);
    return true;
  });
  const selected = shuffle(eligible);
  const make = (card: Card, kind: TestKind, index: number): TestQuestion => {
    const reverse =
      direction === "terms" ||
      (kind !== "matching" && direction === "both" && index % 2 === 0);
    const side = sides(card, reverse);
    if (!side.answer.trim() && kind === "written") kind = "choice";
    const options = shuffle([
      card,
      ...shuffle(eligible.filter((c) => c.id !== card.id)).slice(
        0,
        kind === "matching" ? 7 : 3,
      ),
    ]).map((c) => {
      const s = sides(c, reverse);
      return {
        id: c.id,
        text: s.answer,
        image: s.answerImage,
        audio: s.answerAudio,
        video: s.answerVideo,
      };
    });
    const claimed =
      Math.random() < 0.5
        ? options.find((o) => o.id === card.id)!
        : options.find((o) => o.id !== card.id) || options[0];
    return {
      card,
      kind,
      prompt: side.prompt,
      promptImage: side.image,
      promptAudio: side.audio,
      promptVideo: side.video,
      answer: side.answer,
      answerImage: side.answerImage,
      answerAudio: side.answerAudio,
      answerVideo: side.answerVideo,
      choices: options,
      claim: claimed.text,
      claimImage: claimed.image,
      claimAudio: claimed.audio,
      claimVideo: claimed.video,
      truth: claimed.id === card.id,
    };
  };
  const questions: TestQuestion[] = [];
  const pool = [...selected];
  const singles = kinds.filter((kind) => kind !== "matching");
  const target = Math.min(count, eligible.length);
  let boards = !kinds.includes("matching")
    ? 0
    : singles.length
      ? Math.min(
          Math.ceil(target / kinds.length),
          Math.floor((eligible.length - target) / 2),
        )
      : Math.min(count, Math.floor(eligible.length / 3));
  const singleSlots = singles.length ? target - boards : 0;
  while (boards > 0) {
    // Remove ambiguity inside each group: identical visible sides cannot be graded uniquely.
    const unique: Card[] = [],
      deferred: Card[] = [];
    const prompts = new Set<string>(),
      answers = new Set<string>();
    for (const card of pool) {
      const side = sides(card, direction === "terms");
      const p = JSON.stringify([
          textKey(side.prompt),
          side.image || "",
          side.audio || "",
          side.video || "",
        ]),
        a = JSON.stringify([
          textKey(side.answer),
          side.answerImage || "",
          side.answerAudio || "",
          side.answerVideo || "",
        ]);
      if (prompts.has(p) || answers.has(a)) {
        deferred.push(card);
        continue;
      }
      prompts.add(p);
      answers.add(a);
      unique.push(card);
    }
    const size = Math.min(
      unique.length,
      matchingGroupSize(pool.length - singleSlots, boards),
    );
    if (size < 3) break;
    const group = unique.splice(0, size);
    pool.splice(0, pool.length, ...unique, ...deferred);
    const rows = group.map((card, index) => make(card, "matching", index));
    const choices = rows.map((q) => ({
      id: q.card.id,
      text: q.answer,
      image: q.answerImage,
      audio: q.answerAudio,
      video: q.answerVideo,
    }));
    rows.forEach((row) => (row.choices = choices));
    boards--;
    questions.push({
      ...rows[0],
      matchRows: rows,
      initialOrder: shuffledAnswerOrder(rows.map((q) => q.card.id)),
    });
  }
  if (singles.length) {
    while (pool.length && questions.length < target) {
      questions.push(
        make(
          pool.shift()!,
          singles[questions.length % singles.length],
          questions.length,
        ),
      );
    }
  }
  return questions;
}
export interface TestGradingOptions { requireExact?: boolean; requireAccents?: boolean; }
export function testCorrect(q: TestQuestion, value: string | undefined, options: TestGradingOptions = {}) {
  const strict = options.requireExact !== false;
  const accents = options.requireAccents !== false;
  const writtenCorrect = (input: string, expected: string) => strict
    ? gradeAnswer(input, expected, "strict", accents) !== "INCORRECT"
    : grade(input, expected, "normal", accents) !== "INCORRECT";
  if (q.structuredTargets) return q.structuredTargets.every(target => writtenCorrect(structuredAnswers(value)[target.id] || "",target.answer));
  if (!value?.trim()) return false;
  return q.kind === "written"
    ? writtenCorrect(value, q.answer)
    : q.kind === "boolean"
      ? value === String(q.truth)
      : value === q.card.id;
}
export function structuredAnswers(value: string | undefined): Record<string,string> {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) && Object.values(parsed).every(v => typeof v === "string") ? parsed : {}; } catch { return {}; }
}
export function questionId(question: TestQuestion) {return question.id || question.card.id;}
export function testAnswered(q: TestQuestion, value: string | undefined) {
  return q.structuredTargets ? q.structuredTargets.every(t => structuredAnswers(value)[t.id]?.trim()) : !!value?.trim();
}
export function testAnswer(q: TestQuestion, value: string | undefined) {
  if (q.structuredTargets) return q.structuredTargets.map(target => `${target.label}: ${structuredAnswers(value)[target.id] || "Unanswered"}`).join("; ");
  return !value
    ? "Unanswered"
    : q.kind === "written"
      ? value
      : q.kind === "boolean"
        ? value === "true"
          ? "True"
          : "False"
        : q.choices.find((c) => c.id === value)?.text || "Image selection";
}
export const testLabels: Record<TestKind, string> = {
  choice: "Multiple choice",
  written: "Written",
  boolean: "True / False",
  matching: "Matching",
};
