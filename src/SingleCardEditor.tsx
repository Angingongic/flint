import { useState } from "react";
import { Modal } from "./ui";
import { isValidCardDraft, type Card } from "./lib";
import { useUndoState, swapSides } from "./editing";
import {
  ImageField,
  ImageDestination,
  useImageDragFeedback,
} from "./ImageField";
import { AudioField } from "./Audio";
import { InsertMedia } from "./InsertMedia";
export function SingleCardEditor({
  card,
  starred,
  save,
  close,
}: {
  card: Card;
  starred: boolean;
  save: (card: Card, starred: boolean) => Promise<void>;
  close: () => void;
}) {
  useImageDragFeedback();
  const [draft, setDraft, undo, canUndo] = useUndoState({ ...card, starred });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Edit card"
      onClose={() => {
        if (!busy) close();
      }}
    >
      <div
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            e.stopPropagation();
            undo();
          }
        }}
      >
        <button disabled={!canUndo || busy} onClick={undo}>
          Undo card edit
        </button>
        <button
          aria-label="Star editor card"
          aria-pressed={draft.starred}
          onClick={() => setDraft((old) => ({ ...old, starred: !old.starred }))}
        >
          {draft.starred ? "★" : "☆"}
        </button>
        <div className="edit-card-sides">
          <button
            className="side-swap icon"
            title="Swap front and back"
            aria-label="Swap front and back"
            onClick={() => setDraft(swapSides)}
          >
            ⇄
          </button>
          {(["question", "answer"] as const).map((side) => (
            <section key={side}>
              <ImageDestination>
                <label>
                  {side === "question" ? "Front" : "Back"}
                  <textarea
                    value={draft[side]}
                    onChange={(e) =>
                      setDraft((old) => ({ ...old, [side]: e.target.value }))
                    }
                  />
                </label>
                <InsertMedia>
                  <ImageField
                    label={side + " image"}
                    value={
                      draft[
                        side === "question" ? "questionImage" : "answerImage"
                      ]
                    }
                    onChange={(value) =>
                      setDraft((old) => ({
                        ...old,
                        [side === "question" ? "questionImage" : "answerImage"]:
                          value,
                      }))
                    }
                  />
                  <AudioField
                    label={side + " audio"}
                    value={
                      draft[
                        side === "question" ? "questionAudio" : "answerAudio"
                      ]
                    }
                    onChange={(value) =>
                      setDraft((old) => ({
                        ...old,
                        [side === "question" ? "questionAudio" : "answerAudio"]:
                          value,
                      }))
                    }
                  />
                </InsertMedia>
              </ImageDestination>
            </section>
          ))}
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button disabled={busy} onClick={close}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || !isValidCardDraft(draft)}
            onClick={async () => {
              setBusy(true);
              try {
                await save(draft, draft.starred);
                close();
              } catch {
                setError(
                  "Could not save this card. Your edits are preserved; try again.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save card
          </button>
        </div>
      </div>
    </Modal>
  );
}
