import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
export type DragPoint = { id: string; x: number; y: number };
export function usePointerDrag(
  onMove: (point: DragPoint) => void,
  onDrop: (point: DragPoint) => void,
  onEnd?: () => void,
) {
  const handlers = useRef({ onMove, onDrop, onEnd });
  handlers.current = { onMove, onDrop, onEnd };
  const [active, setActive] = useState<string | null>(null);
  const suppress = useRef(false),
    cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);
  const begin = (
    e: ReactPointerEvent<HTMLElement>,
    id: string,
    touchHandle = false,
  ) => {
    if (
      e.button !== 0 ||
      (e.target as Element).closest(
        ".deck-menu,.audio-player,input,select,textarea",
      ) ||
      (e.pointerType === "touch" &&
        touchHandle &&
        !(e.target as Element).closest(".drag-handle"))
    )
      return;
    cancel.current();
    const element = e.currentTarget,
      start = { x: e.clientX, y: e.clientY },
      rect = element.getBoundingClientRect();
    let ghost: HTMLElement | null = null;
    const move = (event: PointerEvent) => {
      if (event.pointerId !== e.pointerId) return;
      if (
        !ghost &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 7
      )
        return;
      if (!ghost) {
        ghost = element.cloneNode(true) as HTMLElement;
        ghost.setAttribute("aria-hidden", "true");
        ghost.inert = true;
        Object.assign(ghost.style, {
          position: "fixed",
          margin: "0",
          width: rect.width + "px",
          height: rect.height + "px",
          zIndex: "10000",
          pointerEvents: "none",
          opacity: "1",
          transform: "none",
        });
        ghost.classList.add("pointer-drag-ghost");
        document.body.append(ghost);
        setActive(id);
        suppress.current = true;
        window.getSelection()?.removeAllRanges();
      }
      ghost.style.left = event.clientX - (start.x - rect.left) + "px";
      ghost.style.top = event.clientY - (start.y - rect.top) + "px";
      handlers.current.onMove({ id, x: event.clientX, y: event.clientY });
    };
    const stop = () => {
      setActive(null);
      setTimeout(() => {
        suppress.current = false;
      }, 0);
      ghost?.remove();
      ghost = null;
      handlers.current.onEnd?.();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", stop);
      cancel.current = () => {};
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== e.pointerId) return;
      if (ghost && event.type !== "pointercancel")
        handlers.current.onDrop({ id, x: event.clientX, y: event.clientY });
      setActive(null);
      stop();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setTimeout(() => {
        suppress.current = false;
      }, 0);
    };
    cancel.current = stop;
    window.addEventListener("blur", stop);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  return {
    active,
    begin,
    click: (e: React.MouseEvent) => {
      if (suppress.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
