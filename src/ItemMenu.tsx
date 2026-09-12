import {
  Children,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type HTMLAttributes,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
export function menuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  vw: number,
  vh: number,
) {
  return {
    left: Math.max(8, Math.min(x, vw - width - 8)),
    top: Math.max(8, Math.min(y, vh - height - 8)),
  };
}
// Both anchors render the exact same child actions; only their coordinates differ.
export const ItemMenu = forwardRef<
  HTMLDetailsElement,
  HTMLAttributes<HTMLDetailsElement> & { children: ReactNode }
>(function ItemMenu({ children, ...props }, forwarded) {
  const details = useRef<HTMLDetailsElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const parts = Children.toArray(children);
  const close = () => {
    if (details.current) details.current.open = false;
    setAnchor(null);
  };
  useEffect(() => {
    const node = details.current!;
    const open = (event: Event) => {
      const point = (event as CustomEvent).detail;
      document.dispatchEvent(new CustomEvent("flint-close-menus"));
      node.open = true;
      setAnchor(point);
    };
    const outside = (e: PointerEvent) => {
      if (
        !node.contains(e.target as Node) &&
        !panel.current?.contains(e.target as Node)
      )
        close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && node.open) {
        close();
        node
          .querySelector<HTMLElement>("summary")
          ?.focus({ preventScroll: true });
      }
    };
    node.addEventListener("flint-menu", open);
    document.addEventListener("flint-close-menus", close);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      node.removeEventListener("flint-menu", open);
      document.removeEventListener("flint-close-menus", close);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, []);
  useLayoutEffect(() => {
    if (!anchor || !panel.current) return;
    const r = panel.current.getBoundingClientRect(),
      pos = menuPosition(
        anchor.x,
        anchor.y,
        r.width,
        r.height,
        innerWidth,
        innerHeight,
      );
    Object.assign(panel.current.style, {
      left: pos.left + "px",
      top: pos.top + "px",
    });
    panel.current
      .querySelector<HTMLElement>("button,select")
      ?.focus({ preventScroll: true });
  }, [anchor]);
  return (
    <details
      {...props}
      ref={(node) => {
        details.current = node;
        if (typeof forwarded === "function") forwarded(node);
        else if (forwarded)
          (forwarded as MutableRefObject<HTMLDetailsElement | null>).current =
            node;
      }}
      onToggle={() => {
        if (!details.current?.open) setAnchor(null);
      }}
      onClickCapture={(e) => {
        if (!(e.target as Element).closest("summary")) return;
        e.preventDefault();
        if (anchor) close();
        else {
          const r = e.currentTarget
            .querySelector("summary")!
            .getBoundingClientRect();
          e.currentTarget.dispatchEvent(
            new CustomEvent("flint-menu", {
              detail: { x: r.left, y: r.bottom + 4 },
            }),
          );
        }
      }}
    >
      {parts[0]}
      {anchor &&
        createPortal(
          <div
            ref={panel}
            className="anchored-item-menu"
            role="region"
            aria-label="Item actions"
            style={{ position: "fixed", left: anchor.x, top: anchor.y }}
            onClick={(e) => {
              if ((e.target as Element).closest("button")) close();
            }}
          >
            {parts.slice(1)}
          </div>,
          document.body,
        )}
    </details>
  );
});
