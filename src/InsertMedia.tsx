import { useRef, type ReactNode } from "react";

// Reuse the existing uploaders, validation and error states, including paste/drop.
export function InsertMedia({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div ref={root} className="insert-media">
      <details className="deck-menu">
        <summary>+ Insert ▾</summary>
        <div className="menu-popover">
          {(["Image", "Audio"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                root.current!.querySelector("details")!.open = false;
                root.current
                  ?.querySelector<HTMLInputElement>(
                    kind === "Image"
                      ? '.attachment input[type="file"]'
                      : '.audio-field input[type="file"]',
                  )
                  ?.click();
              }}
            >
              {kind}
            </button>
          ))}
        </div>
      </details>
      {children}
    </div>
  );
}
