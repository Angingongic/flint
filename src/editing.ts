import { useRef, useState } from "react";
import type { Card, Deck } from "./lib";
import { levenshtein } from "./lib";
export const editableTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
  );
export const duplicateText = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
export function duplicateKind(
  a: Pick<
    Card,
    | "question"
    | "answer"
    | "questionImage"
    | "answerImage"
    | "questionAudio"
    | "answerAudio"
  >,
  b: Pick<
    Card,
    | "question"
    | "answer"
    | "questionImage"
    | "answerImage"
    | "questionAudio"
    | "answerAudio"
  >,
): "exact" | "near" | null {
  if (
    (a.questionImage || "") !== (b.questionImage || "") ||
    (a.answerImage || "") !== (b.answerImage || "") ||
    (a.questionAudio || "") !== (b.questionAudio || "") ||
    (a.answerAudio || "") !== (b.answerAudio || "")
  )
    return null;
  const aq = duplicateText(a.question),
    bq = duplicateText(b.question),
    aa = duplicateText(a.answer),
    ba = duplicateText(b.answer);
  if (aq === bq && aa === ba) return "exact";
  if (
    aa === ba &&
    Math.min(aq.length, bq.length) >= 8 &&
    levenshtein(aq, bq) <= 1
  )
    return "near";
  if (
    aq === bq &&
    Math.min(aa.length, ba.length) >= 12 &&
    levenshtein(aa, ba) <= 1
  )
    return "near";
  return null;
}
export type DuplicateChoice = {
  cardId: string;
  targetId: string;
  action: "keep" | "skip" | "replace";
};
export function resolveDuplicates<
  T extends {
    id: string;
    question: string;
    answer: string;
    questionImage?: string | null;
    answerImage?: string | null;
    questionAudio?: string | null;
    answerAudio?: string | null;
  },
>(cards: T[], choices: DuplicateChoice[]): T[] {
  const output: T[] = [];
  for (const card of cards) {
    const decision = choices.find((c) => c.cardId === card.id);
    const target = output.findIndex((c) => c.id === decision?.targetId);
    if (!decision || decision.action === "keep" || target < 0)
      output.push(card);
    else if (decision.action === "replace")
      output[target] = {
        ...output[target],
        question: card.question,
        answer: card.answer,
        questionImage: card.questionImage,
        answerImage: card.answerImage,
        questionAudio: card.questionAudio,
        answerAudio: card.answerAudio,
      };
  }
  return output;
}
export function trashVictims(decks: Deck[], now = Date.now()): string[] {
  const trash = decks
    .filter(
      (d) => d.meta?.deletedAt && Number.isFinite(Date.parse(d.meta.deletedAt)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.meta!.deletedAt!) - Date.parse(a.meta!.deletedAt!) ||
        a.id.localeCompare(b.id),
    );
  return trash
    .filter(
      (d, i) => i >= 5 || now - Date.parse(d.meta!.deletedAt!) >= 7 * 86400000,
    )
    .map((d) => d.id);
}
export function resolvedStars(
  stars: string[],
  cards: { id: string }[],
  choices: DuplicateChoice[],
) {
  const ids = new Set(cards.map((c) => c.id));
  return [
    ...new Set(
      stars.map((id) => {
        const choice = choices.find((c) => c.cardId === id);
        return choice?.action === "replace" ? choice.targetId : id;
      }),
    ),
  ].filter((id) => ids.has(id));
}
export function moveFolder(
  decks: Deck[],
  ids: string[],
  folder: string,
): Deck[] {
  return decks.map((d) =>
    ids.includes(d.id)
      ? { ...d, meta: { ...d.meta, folder: folder.trim() } }
      : d,
  );
}
export function useUndoState<T>(initial: T) {
  const [state, rawSet] = useState(initial),
    current = useRef(state),
    history = useRef<T[]>([]);
  const set = (update: T | ((old: T) => T)) => {
    const next =
      typeof update === "function"
        ? (update as (old: T) => T)(current.current)
        : update;
    if (next === current.current) return;
    history.current.push(structuredClone(current.current));
    if (history.current.length > 100) history.current.shift();
    current.current = next;
    rawSet(next);
  };
  const undo = () => {
    if (!history.current.length) return;
    const prior = history.current.pop()!;
    current.current = prior;
    rawSet(prior);
  };
  return [state, set, undo, history.current.length > 0] as const;
}
export function swapSides<
  T extends {
    question: string;
    answer: string;
    questionImage?: string | null;
    answerImage?: string | null;
    questionAudio?: string | null;
    answerAudio?: string | null;
  },
>(card: T): T {
  return {
    ...card,
    question: card.answer,
    answer: card.question,
    questionImage: card.answerImage,
    answerImage: card.questionImage,
    questionAudio: card.answerAudio,
    answerAudio: card.questionAudio,
  };
}
