import { useMemo, useState } from "react";
import { shuffle } from "./learn-engine";
import { StudyImage } from "./Study";
export type MatchItem = { id: string; text: string; image?: string | null };
export function pairItems(
  pairs: Record<string, string>,
  left: string,
  right: string,
) {
  return {
    ...Object.fromEntries(
      Object.entries(pairs).filter(([l, r]) => l !== left && r !== right),
    ),
    [left]: right,
  };
}
export function Matching({
  left,
  right,
  pairs,
  onChange,
  disabled = false,
  reveal = false,
  termFirst = true,
}: {
  left: MatchItem[];
  right: MatchItem[];
  pairs: Record<string, string>;
  onChange: (pairs: Record<string, string>) => void;
  disabled?: boolean;
  reveal?: boolean;
  termFirst?: boolean;
}) {
  const columns = useMemo(() => [shuffle(left), shuffle(right)], [left, right]);
  const [selected, setSelected] = useState<{ side: number; id: string } | null>(
    null,
  );
  const choose = (side: number, id: string) => {
    if (selected && selected.side !== side) {
      onChange(
        pairItems(
          pairs,
          side === 0 ? id : selected.id,
          side === 1 ? id : selected.id,
        ),
      );
      setSelected(null);
    } else
      setSelected(
        selected?.id === id && selected.side === side ? null : { side, id },
      );
  };
  const owners = left.filter((item) => pairs[item.id]).map((item) => item.id);
  return (
    <section
      className="matching-board"
      aria-label="Match terms and definitions"
    >
      <p>
        Select an item in each column. Pair numbers show your matches, not
        correctness. Select a different partner to change a pair.
      </p>
      <div className="matching-columns">
        {columns.map((items, side) => (
          <div
            key={side}
            role="group"
            aria-label={(side === 0) === termFirst ? "Terms" : "Definitions"}
          >
            <h3>{(side === 0) === termFirst ? "Terms" : "Definitions"}</h3>
            {items.map((item) => {
              const owner =
                side === 0
                  ? pairs[item.id]
                    ? item.id
                    : undefined
                  : owners.find((id) => pairs[id] === item.id);
              return (
                <button
                  type="button"
                  className={
                    "secondary matching-item " +
                    (selected?.id === item.id && selected.side === side
                      ? "selected"
                      : "")
                  }
                  aria-pressed={
                    selected?.id === item.id && selected.side === side
                  }
                  disabled={disabled}
                  key={item.id}
                  onClick={() => choose(side, item.id)}
                  onKeyDown={(e) => {
                    if (
                      ![
                        "ArrowDown",
                        "ArrowUp",
                        "ArrowLeft",
                        "ArrowRight",
                      ].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const group = e.currentTarget.parentElement!;
                    const buttons = Array.from(
                      group.querySelectorAll<HTMLButtonElement>("button"),
                    );
                    const i = buttons.indexOf(e.currentTarget);
                    if (e.key === "ArrowDown" || e.key === "ArrowUp")
                      buttons[
                        (i +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          buttons.length) %
                          buttons.length
                      ]?.focus();
                    else
                      group.parentElement?.children[side === 0 ? 1 : 0]
                        .querySelectorAll<HTMLButtonElement>("button")
                        [i]?.focus();
                  }}
                >
                  <small>
                    {owner ? `Pair ${owners.indexOf(owner) + 1}` : "Unpaired"}
                  </small>
                  <span>{item.text}</span>
                  <StudyImage
                    name={item.image}
                    alt={side === 0 ? "Prompt image" : "Answer image"}
                  />
                  {reveal && owner && (
                    <b>
                      {pairs[owner] === owner ? "✓ Correct" : "✕ Incorrect"}
                    </b>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="matching-pairs" aria-live="polite">
        {owners.map((id, i) => (
          <div key={id}>
            <span>
              Pair {i + 1}:{" "}
              {left.find((x) => x.id === id)?.text || "Prompt image"} ↔{" "}
              {right.find((x) => x.id === pairs[id])?.text || "Answer image"}
            </span>
            <button
              type="button"
              disabled={disabled}
              className="secondary"
              aria-label={`Unpair ${i + 1}`}
              onClick={() => {
                const next = { ...pairs };
                delete next[id];
                onChange(next);
                setSelected(null);
              }}
            >
              Unpair
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
