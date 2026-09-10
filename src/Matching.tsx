import { useLayoutEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { StudyImage } from "./Study";
export type MatchItem = { id: string; text: string; image?: string | null };
export function moveAnswer(order: string[], from: number, to: number) {
  if (
    from < 0 ||
    to < 0 ||
    from >= order.length ||
    to >= order.length ||
    from === to
  )
    return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
export function Matching({
  left,
  right,
  order,
  onChange,
  disabled = false,
  reveal = false,
  termFirst = true,
}: {
  left: MatchItem[];
  right: MatchItem[];
  order: string[];
  onChange: (order: string[]) => void;
  disabled?: boolean;
  reveal?: boolean;
  termFirst?: boolean;
}) {
  const [dragged, setDragged] = useState<string | null>(null),
    [target, setTarget] = useState<number | null>(null),
    [announcement, setAnnouncement] = useState("");
  const handles = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusAfterMove = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusAfterMove.current) {
      handles.current[focusAfterMove.current]?.focus();
      focusAfterMove.current = null;
    }
  }, [order]);
  const move = (id: string, to: number) => {
    if (disabled) return;
    const next = moveAnswer(order, order.indexOf(id), to);
    if (next === order) return;
    focusAfterMove.current = id;
    onChange(next);
    setAnnouncement(`Moved answer to row ${to + 1} of ${left.length}`);
  };
  return (
    <section
      className="matching-board reorder-match"
      aria-label="Match terms and definitions"
    >
      <p>
        Drag the answers into order beside the fixed prompts. Focus a drag
        handle and use ↑ / ↓ to move an answer.
      </p>
      <div className="match-row match-heading">
        <h3>{termFirst ? "Terms" : "Definitions"}</h3>
        <h3>{termFirst ? "Definitions" : "Terms"}</h3>
      </div>
      {left.map((item, index) => {
        const answer = right.find((r) => r.id === order[index]);
        return (
          <div
            className={
              "match-row " +
              (target === index ? "drop-target " : "") +
              (reveal
                ? item.id === answer?.id
                  ? "result-correct"
                  : "result-wrong"
                : "")
            }
            key={item.id}
            onDragOver={(e) => {
              if (dragged && !disabled) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setTarget(index);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged) move(dragged, index);
              setDragged(null);
              setTarget(null);
            }}
          >
            <div className="match-prompt">
              <small>Row {index + 1}</small>
              <span>{item.text}</span>
              <StudyImage name={item.image} alt={"Prompt " + (index + 1)} />
            </div>
            <div
              className={
                "match-answer-item " +
                (dragged === answer?.id ? "dragging" : "")
              }
              draggable={!disabled}
              onDragStart={(e) => {
                if (!answer || disabled) {
                  e.preventDefault();
                  return;
                }
                setDragged(answer.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", answer.id);
              }}
              onDragEnd={() => {
                setDragged(null);
                setTarget(null);
              }}
            >
              {answer && (
                <>
                  <button
                    type="button"
                    className="drag-handle"
                    disabled={disabled}
                    ref={(el) => {
                      handles.current[answer.id] = el;
                    }}
                    aria-label={`Move ${answer.text || "image answer"}; row ${index + 1} of ${left.length}. Use up and down arrows.`}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                        e.preventDefault();
                        move(answer.id, index + (e.key === "ArrowUp" ? -1 : 1));
                      }
                    }}
                  >
                    <GripVertical size={18} />
                  </button>
                  <div>
                    <span>{answer.text}</span>
                    <StudyImage
                      name={answer.image}
                      alt={"Answer in row " + (index + 1)}
                    />
                  </div>
                </>
              )}
              {reveal && (
                <div className="match-row-result">
                  <b>{item.id === answer?.id ? "✓ Correct" : "✕ Incorrect"}</b>
                  {item.id !== answer?.id && (
                    <>
                      <p>
                        Correct answer:{" "}
                        {right.find((r) => r.id === item.id)?.text || "Image"}
                      </p>
                      <StudyImage
                        name={right.find((r) => r.id === item.id)?.image}
                        alt="Correct answer visual"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
