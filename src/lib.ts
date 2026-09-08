export type Card = {
  id: string;
  question: string;
  answer: string;
  status: "New" | "Learning" | "Review" | "Mastered";
  accuracy: number;
  due: boolean;
  dueAt?: string;
  intervalDays?: number;
  ease?: number;
  repetitions?: number;
  lapses?: number;
  lastReviewed?: string | null;
  sourceName?: string | null;
  sourceLocation?: string | null;
  questionImage?: string | null;
  answerImage?: string | null;
};
export type Deck = {
  id: string;
  title: string;
  subject: string;
  color: string;
  cards: Card[];
  favorite?: boolean;
  lastStudied?: string;
  coverImage?: string | null;
  createdAt?: string;
  meta?: {
    description?: string;
    folder?: string;
    tags?: string[];
    archived?: boolean;
    deletedAt?: string | null;
    starredCards?: string[];
  };
};
export const uid = () => crypto.randomUUID();
export const newCard = (
  question: string,
  answer: string,
  sourceName?: string,
): Card => ({
  id: uid(),
  question,
  answer,
  status: "New",
  accuracy: 0,
  due: true,
  dueAt: new Date().toISOString(),
  intervalDays: 0,
  ease: 2.5,
  repetitions: 0,
  lapses: 0,
  lastReviewed: null,
  sourceName: sourceName || null,
  sourceLocation: null,
  questionImage: null,
  answerImage: null,
});
export type CardDraft = {
  question?: string;
  answer?: string;
  questionImage?: string | null;
  answerImage?: string | null;
};
export function isValidCardDraft(card: CardDraft) {
  return (
    (!!card.question?.trim() || !!card.questionImage) &&
    (!!card.answer?.trim() || !!card.answerImage)
  );
}
export function canCreateDeck(title: string, cards: CardDraft[]) {
  return !!title.trim() && cards.some(isValidCardDraft);
}
export function normalize(
  s: string,
  { caseSensitive = false, punctuation = false } = {},
) {
  let v = s.trim().replace(/\s+/g, " ");
  if (!caseSensitive) v = v.toLowerCase();
  if (!punctuation) v = v.replace(/[^\p{L}\p{N}\s]/gu, "");
  return v;
}
export function levenshtein(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = t;
    }
  }
  return row[b.length];
}
export function checkAnswer(input: string, answer: string, mode = "ignore") {
  if (mode === "exact") return input.trim() === answer.trim();
  if (mode === "case")
    return (
      normalize(input, { punctuation: true }) ===
      normalize(answer, { punctuation: true })
    );
  if (mode === "punctuation")
    return (
      normalize(input, { caseSensitive: true }) ===
      normalize(answer, { caseSensitive: true })
    );
  const a = normalize(input),
    b = normalize(answer);
  if (mode === "typo")
    return levenshtein(a, b) <= Math.max(1, Math.floor(b.length * 0.08));
  return a === b;
}
export type ParsedCard = { question: string; answer: string };
export type ParseResult = {
  cards: ParsedCard[];
  format: string | null;
  confidence: number;
};
const parsers = [
  { name: "tabs", pattern: /\t+/ },
  { name: "colon", pattern: /\s*:+\s+/ },
  { name: "dash", pattern: /\s+[—–-]+\s+/ },
  { name: "pipe", pattern: /\s*\|+\s*/ },
  { name: "semicolon", pattern: /\s*;+\s+/ },
  { name: "multiple spaces", pattern: / {2,}/ },
] as const;
function cleanImportLine(line: string) {
  return line.trim().replace(/^\d+[.)]\s*/, "");
}
function splitWith(line: string, pattern: RegExp): ParsedCard | null {
  const match = line.match(pattern);
  if (match?.index === undefined) return null;
  const question = line.slice(0, match.index).trim().replace(/\s+/g, " ");
  const answer = line
    .slice(match.index + match[0].length)
    .trim()
    .replace(/\s+/g, " ");
  return question && answer ? { question, answer } : null;
}
export function parseCardsDetailed(text: string): ParseResult {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanImportLine)
    .filter(Boolean);
  if (!lines.length) return { cards: [], format: null, confidence: 0 };
  const candidates: ParseResult[] = parsers.map(({ name, pattern }) => {
    const cards = lines
      .map((line) => splitWith(line, pattern))
      .filter(Boolean) as ParsedCard[];
    const malformed = lines.length - cards.length;
    const consistency = cards.length / lines.length;
    const confidence = cards.length
      ? Math.max(
          0,
          Math.min(
            1,
            consistency * 0.75 +
              Math.min(cards.length / 3, 1) * 0.25 -
              malformed * 0.03,
          ),
        )
      : 0;
    return { cards, format: name, confidence };
  });
  const mixedCards = lines
    .map((line) => {
      for (const parser of parsers) {
        const card = splitWith(line, parser.pattern);
        if (card) return card;
      }
      return null;
    })
    .filter(Boolean) as ParsedCard[];
  if (mixedCards.length) {
    const consistency = mixedCards.length / lines.length;
    candidates.push({
      cards: mixedCards,
      format: "mixed separators",
      confidence:
        consistency === 1
          ? Math.min(0.88, 0.63 + mixedCards.length * 0.05)
          : consistency * 0.55,
    });
  }
  if (lines.length >= 2 && lines.length % 2 === 0) {
    const cards: ParsedCard[] = [];
    for (let index = 0; index < lines.length; index += 2)
      cards.push({
        question: lines[index].replace(/\s+/g, " "),
        answer: lines[index + 1].replace(/\s+/g, " "),
      });
    const questionRatio =
      cards.filter((card) => card.question.endsWith("?")).length / cards.length;
    candidates.push({
      cards,
      format:
        questionRatio >= 0.5 ? "question-answer lines" : "alternating lines",
      confidence: Math.min(
        0.9,
        0.62 + Math.min(cards.length / 10, 0.18) + questionRatio * 0.1,
      ),
    });
  }
  const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
  if (!best || best.confidence < 0.6)
    return { cards: [], format: null, confidence: best?.confidence || 0 };
  return best;
}
export function parseCards(text: string) {
  return parseCardsDetailed(text).cards;
}
export function parseDelimited(text: string, delimiter = ",") {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function findDuplicates(cards: { question: string; answer: string }[]) {
  const seen = new Set<string>();
  return cards.map((c) => {
    const key = normalize(c.question) + "\u0000" + normalize(c.answer);
    const duplicate = seen.has(key);
    seen.add(key);
    return duplicate;
  });
}
export function dueCards(decks: Deck[], now = new Date()) {
  return decks
    .flatMap((d) => d.cards)
    .filter((c) => !c.dueAt || new Date(c.dueAt) <= now);
}
export function weakCards(decks: Deck[]) {
  return decks
    .flatMap((d) => d.cards)
    .sort(
      (a, b) =>
        (b.lapses || 0) * 20 +
        100 -
        b.accuracy +
        (b.due ? 30 : 0) -
        ((a.lapses || 0) * 20 + 100 - a.accuracy + (a.due ? 30 : 0)),
    );
}
export const seed: Deck[] = [];
