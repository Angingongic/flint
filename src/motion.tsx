import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export const motion = {
  micro: 120,
  hover: 160,
  panel: 220,
  card: 300,
  page: 240,
  feedback: 500,
  accepted: 800,
  incorrect: 2600,
  phase: 1100,
} as const;
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="motion-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span
        style={{
          transform: `scaleX(${Math.max(0, Math.min(value, 100)) / 100})`,
        }}
      />
    </div>
  );
}
export function MotionPage({
  route,
  children,
}: {
  route: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null),
    reduced = useReducedMotion();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const animation = ref.current?.animate?.(
      [
        { opacity: 0.35, transform: reduced ? "none" : "translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: reduced ? 80 : motion.page,
        easing: "cubic-bezier(.2,.7,.2,1)",
      },
    );
    return () => animation?.cancel();
  }, [route, reduced]);
  return <div ref={ref}>{children}</div>;
}
export function DeferredLoading({
  busy,
  label = "Saving",
}: {
  busy: boolean;
  label?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 180);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <span className="loading-slot" role="status">
      {visible && (
        <>
          <span className="motion-spinner" />
          {label}…
        </>
      )}
    </span>
  );
}
export function notify(
  message: string,
  kind: "success" | "error" = "success",
  undo?: () => void,
) {
  window.dispatchEvent(
    new CustomEvent("flint-toast", { detail: { message, kind, undo } }),
  );
}
export function Toasts() {
  const [toast, setToast] = useState<{
      message: string;
      kind: string;
      id: number;
      undo?: () => void;
    } | null>(null),
    [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const event = (e: Event) => {
      setLeaving(false);
      setToast({ ...(e as CustomEvent).detail, id: Date.now() });
    };
    window.addEventListener("flint-toast", event);
    return () => window.removeEventListener("flint-toast", event);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const a = setTimeout(
        () => setLeaving(true),
        toast.kind === "error" || toast.undo ? 8000 : 3200,
      ),
      b = setTimeout(
        () => setToast(null),
        toast.kind === "error" || toast.undo ? 8220 : 3420,
      );
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [toast]);
  return toast ? (
    <div
      key={toast.id}
      className={"toast " + toast.kind + (leaving ? " leaving" : "")}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span aria-hidden="true">{toast.kind === "error" ? "✕" : "✓"}</span>
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          className="text-button"
          onClick={() => {
            toast.undo?.();
            setToast(null);
          }}
        >
          Undo
        </button>
      )}
      <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
        ×
      </button>
    </div>
  ) : null;
}
