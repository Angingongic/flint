import { SmartMathTextarea } from "./SmartMathField";
import { mathSuggestion } from "./math-autofill";
import { VideoField } from "./Video";
import { StructuredEditor } from "./StructuredEditor";
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
import { Undo2, Redo2 } from "lucide-react";
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
  const [draft, setDraft, undo, canUndo, redo, canRedo] = useUndoState({
    ...card,
    starred,
  });
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
          if (
            !draft.structure &&
            (e.ctrlKey || e.metaKey) &&
            (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")
          ) {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey || e.key.toLowerCase() === "y") redo();
            else undo();
          }
        }}
      >
        {!draft.structure && <><button className="icon" title="Undo card edit" aria-label="Undo card edit" disabled={!canUndo || busy} onClick={undo}>
          <Undo2 size={18}/>
        </button>
        <button className="icon" title="Redo card edit" aria-label="Redo card edit" disabled={!canRedo || busy} onClick={redo}>
          <Redo2 size={18}/>
        </button></>}
        <button
          aria-label="Star editor card"
          aria-pressed={draft.starred}
          onClick={() => setDraft((old) => ({ ...old, starred: !old.starred }))}
        >
          {draft.starred ? "★" : "☆"}
        </button>
        <StructuredEditor lockType={!!card.structure} value={draft.structure} onChange={structure => setDraft(old => ({ ...old, structure }))}>
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
                  <SmartMathTextarea
                    value={draft[side]}
                    suggestion={side === "answer" && !draft.answer ? mathSuggestion(draft.question) : null}
                    onAcceptSuggestion={answer => setDraft(old => old.answer ? old : {...old,answer})}
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
                  <VideoField
                    label={side + " video"}
                    value={
                      draft[
                        side === "question" ? "questionVideo" : "answerVideo"
                      ]
                    }
                    onChange={(value) =>
                      setDraft((old) => ({
                        ...old,
                        [side === "question" ? "questionVideo" : "answerVideo"]:
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
        </StructuredEditor>
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
