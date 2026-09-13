import { useLayoutEffect, useRef, type RefObject } from "react";
export const reorderMotion = {
  settle: 180,
  highlight: 420,
  easing: "cubic-bezier(.2,.7,.2,1)",
  lift: 3,
} as const;
export function useReorderMotion(
  root: RefObject<HTMLElement | null>,
  selector: string,
  key: string,
) {
  const previous = useRef(new Map<string, { x: number; y: number }>()),
    lastKey = useRef("");
  useLayoutEffect(() => {
    const nodes = root.current?.querySelectorAll<HTMLElement>(selector) || [];
    const next = new Map<string, { x: number; y: number }>();
    for (const el of nodes) {
      const id = el.dataset.answerId || el.dataset.libraryId!;
      let x = 0,
        y = 0,
        node: HTMLElement | null = el;
      while (node) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      next.set(id, { x, y });
    }
    if (lastKey.current !== key && previous.current.size) {
      for (const el of nodes) {
        const id = el.dataset.answerId || el.dataset.libraryId!,
          a = previous.current.get(id),
          b = next.get(id)!;
        if (!a || (a.x === b.x && a.y === b.y)) continue;
        el.getAnimations?.().forEach((animation) => animation.cancel());
        if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
          el.animate?.(
            [
              { transform: `translate(${a.x - b.x}px,${a.y - b.y}px)` },
              { transform: "translate(0,0)" },
            ],
            { duration: reorderMotion.settle, easing: reorderMotion.easing },
          );
        el.animate?.(
          [
            {
              boxShadow: "inset 0 0 0 2px #ef6c3a66",
              backgroundColor: "#ef6c3a20",
            },
            { boxShadow: "inset 0 0 0 2px #ef6c3a00" },
          ],
          {
            duration: reorderMotion.highlight,
            delay: reorderMotion.settle,
            easing: "ease-out",
          },
        );
      }
    }
    previous.current = next;
    lastKey.current = key;
  }, [key, root, selector]);
}
