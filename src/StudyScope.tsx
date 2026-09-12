import { Settings2 } from "lucide-react";
import { ignoreAccents } from "./lib";
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
  mode,
}: {
  deck: Deck;
  children: (deck: Deck, accents: boolean) => ReactNode;
  mode?: "Learn" | "Flashcards";
  done: () => void;
}) {
  const [starred, setStarred] = useState(
    () =>
      !!mode &&
      localStorage.getItem(`flint-${mode.toLowerCase()}-starred`) === "true",
  );
  const [accents, setAccents] = useState(() =>
    localStorage.getItem("flint-learn-ignore-accents") === null
      ? ignoreAccents()
      : localStorage.getItem("flint-learn-ignore-accents") === "true",
  );
  const selected = scopedDeck(deck, starred);
  return (
    <>
      {mode ? (
        <details className="study-mode-settings">
          <summary aria-label={mode + " settings"}>
            <Settings2 size={18} /> Settings
          </summary>
          <div>
            <label>
              <input
                type="checkbox"
                checked={starred}
                onChange={(e) => {
                  setStarred(e.target.checked);
                  localStorage.setItem(
                    `flint-${mode.toLowerCase()}-starred`,
                    String(e.target.checked),
                  );
                }}
              />
              {mode === "Learn"
                ? "Practice starred cards only"
                : "Study starred cards only"}
            </label>
            {mode === "Learn" && (
              <label>
                <input
                  type="checkbox"
                  checked={accents}
                  onChange={(e) => {
                    setAccents(e.target.checked);
                    localStorage.setItem(
                      "flint-learn-ignore-accents",
                      String(e.target.checked),
                    );
                  }}
                />
                Ignore accents
              </label>
            )}
          </div>
        </details>
      ) : (
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
      )}
      {selected.cards.length ? (
        <div key={`${deck.id}-${starred}`}>{children(selected, accents)}</div>
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
