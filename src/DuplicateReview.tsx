import { useState } from "react";
import type { Card } from "./lib";
import { duplicateKind, type DuplicateChoice } from "./editing";
import { Modal } from "./ui";
export function duplicateCandidates(cards: Card[]) {
  const anchors: Card[] = [];
  return cards.flatMap((card) => {
    const target = anchors.find((other) => duplicateKind(card, other));
    if (!target) anchors.push(card);
    return target ? [{ card, target, kind: duplicateKind(card, target) }] : [];
  });
}
export function DuplicateReview({
  cards,
  onConfirm,
  onClose,
}: {
  cards: Card[];
  onConfirm: (choices: DuplicateChoice[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const candidates = duplicateCandidates(cards);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<
    Record<string, DuplicateChoice["action"]>
  >({});
  return (
    <Modal
      title="Review duplicate cards"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Duplicates within this set. Nothing is changed until you confirm.
        Replace updates the earlier card's content while retaining its identity
        and study history.
      </p>
      <div className="duplicate-list">
        {candidates.map(({ card, target, kind }) => (
          <div key={card.id}>
            <b>{card.question || "Image card"}</b>
            <p>{card.answer}</p>
            <small>
              {kind === "near" ? "Possible near duplicate" : "Duplicate"} of:{" "}
              {target.question} — {target.answer}
            </small>
            <select
              aria-label={`Resolve duplicate ${card.id}`}
              value={choices[card.id] || "keep"}
              onChange={(e) =>
                setChoices((old) => ({
                  ...old,
                  [card.id]: e.target.value as DuplicateChoice["action"],
                }))
              }
            >
              <option value="keep">Keep Both</option>
              <option value="replace">Replace earlier card</option>
              <option value="skip">Skip this card</option>
            </select>
          </div>
        ))}
      </div>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(
              candidates.map(({ card, target }) => ({
                cardId: card.id,
                targetId: target.id,
                action: choices[card.id] || "keep",
              })),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirm choices
      </button>
      <button className="secondary" disabled={busy} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
