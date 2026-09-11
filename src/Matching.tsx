import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { StudyImage } from "./Study";
export type MatchItem = {
  id: string;
  text: string;
  image?: string | null;
  audio?: string | null;
};
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
  const board = useRef<HTMLElement>(null),
    pointer = useRef<{ id: string; pointerId: number } | null>(null),
    positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    board.current
      ?.querySelectorAll<HTMLElement>("[data-answer-id]")
      .forEach((el) => {
        const id = el.dataset.answerId!,
          top = el.getBoundingClientRect().top,
          old = positions.current.get(id);
        next.set(id, top);
        if (
          old !== undefined &&
          old !== top &&
          !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        )
          el.animate?.(
            [
              { transform: `translateY(${old - top}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 160, easing: "ease-out" },
          );
      });
    positions.current = next;
  }, [order]);
  const focusAfterMove = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusAfterMove.current) {
      handles.current[focusAfterMove.current]?.focus({ preventScroll: true });
      focusAfterMove.current = null;
    }
  }, [order]);
  const move = (id: string, to: number) => {
    if (disabled) return;
    const next = moveAnswer(order, order.indexOf(id), to);
    if (next === order) return;
    if (!pointer.current) focusAfterMove.current = id;
    onChange(next);
    setAnnouncement(`Moved answer to row ${to + 1} of ${left.length}`);
  };
  const dragY = useRef(0);
  const dragMove = useRef(move);
  dragMove.current = move;
  useEffect(() => {
    if (!dragged) return;
    let frame = 0,
      previousTime = 0;
    let container = board.current?.parentElement;
    while (
      container &&
      !(
        container.scrollHeight > container.clientHeight &&
        /auto|scroll/.test(getComputedStyle(container).overflowY)
      )
    )
      container = container.parentElement;
    const scroller = container;
    const tick = (time: number) => {
      if (!pointer.current) return;
      const bounds = scroller?.getBoundingClientRect();
      const top = Math.max(0, bounds?.top || 0),
        bottom = Math.min(
          window.innerHeight,
          bounds?.bottom || window.innerHeight,
        );
      const y = dragY.current,
        edge = 64;
      const speed =
        y < top + edge
          ? -Math.min(1, (top + edge - y) / edge)
          : y > bottom - edge
            ? Math.min(1, (y - bottom + edge) / edge)
            : 0;
      const delta =
        speed * Math.min(32, previousTime ? time - previousTime : 16) * 0.45;
      previousTime = time;
      if (delta) {
        if (scroller) scroller.scrollTop += delta;
        else window.scrollBy(0, delta);
        const rows = Array.from(
          board.current?.querySelectorAll<HTMLElement>(
            ".match-row:not(.match-heading)",
          ) || [],
        );
        const index = rows.findIndex((row) => {
          const r = row.getBoundingClientRect();
          return y >= r.top && y <= r.bottom;
        });
        if (index >= 0) dragMove.current(pointer.current.id, index);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragged]);
  return (
    <section
      ref={board}
      className="matching-board reorder-match"
      aria-label="Match terms and definitions"
    >
      <p className="match-help">
        Drag answers (use the grip on touchscreens) · ↑ / ↓ to move a focused
        answer
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
              <small className="match-number" aria-label={`Row ${index + 1}`}>
                {index + 1}
              </small>
              <span>{item.text}</span>
              <StudyImage
                name={item.image}
                audio={item.audio}
                alt={"Prompt " + (index + 1)}
              />
            </div>
            <div
              className={
                "match-answer-item " +
                (dragged === answer?.id ? "dragging" : "")
              }
              data-answer-id={answer?.id}
              style={{ touchAction: "pan-y" }}
              onPointerDown={(e) => {
                if (
                  disabled ||
                  (e.pointerType === "touch" &&
                    !(e.target as Element).closest(".drag-handle")) ||
                  !answer ||
                  e.button > 0 ||
                  (e.target as Element).closest(".audio-player")
                )
                  return;
                dragY.current = e.clientY;
                pointer.current = { id: answer.id, pointerId: e.pointerId };
                e.currentTarget.setPointerCapture?.(e.pointerId);
                setDragged(answer.id);
              }}
              onPointerMove={(e) => {
                if (
                  !pointer.current ||
                  pointer.current.pointerId !== e.pointerId
                )
                  return;
                dragY.current = e.clientY;
                const rows = Array.from(
                  board.current?.querySelectorAll<HTMLElement>(
                    ".match-row:not(.match-heading)",
                  ) || [],
                );
                const index = rows.findIndex((row) => {
                  const r = row.getBoundingClientRect();
                  return e.clientY >= r.top && e.clientY <= r.bottom;
                });
                if (index >= 0) {
                  setTarget(index);
                  move(pointer.current.id, index);
                }
              }}
              onPointerUp={(e) => {
                if (pointer.current?.pointerId === e.pointerId) {
                  pointer.current = null;
                  setDragged(null);
                  setTarget(null);
                  e.currentTarget.releasePointerCapture?.(e.pointerId);
                }
              }}
              onPointerCancel={() => {
                pointer.current = null;
                setDragged(null);
                setTarget(null);
              }}
              draggable={false}
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
                    style={{ touchAction: "none" }}
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
                      audio={answer.audio}
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
                        audio={right.find((r) => r.id === item.id)?.audio}
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
