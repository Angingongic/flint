import { useState, type ReactNode } from "react";
import type { Deck } from "./lib";

export function scopedDeck(deck: Deck, starred: boolean): Deck {
  return starred
    ? {
        ...deck,
        cards: deck.cards.filter((c) =>
          deck.meta?.starredCards?.includes(c.id),
        ),
      }
    : deck;
}

export function StudyScope({
  deck,
  children,
  done,
}: {
  deck: Deck;
  children: (deck: Deck) => ReactNode;
  done: () => void;
}) {
  const [starred, setStarred] = useState(false);
  const selected = scopedDeck(deck, starred);
  return (
    <>
      <label className="study-scope">
        Study scope{" "}
        <select
          aria-label="Study scope"
          value={starred ? "starred" : "all"}
          onChange={(e) => setStarred(e.target.value === "starred")}
        >
          <option value="all">All cards</option>
          <option value="starred">Starred only</option>
        </select>
      </label>
      {selected.cards.length ? (
        <div key={`${deck.id}-${starred}`}>{children(selected)}</div>
      ) : (
        <div className="library-empty">
          <h2>{starred ? "No starred cards yet" : "No cards yet"}</h2>
          <p>Star cards in the set overview, or choose All cards.</p>
          <button onClick={done}>Back to set</button>
        </div>
      )}
    </>
  );
}
