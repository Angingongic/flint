import { useEffect, useRef, useState, type ReactNode } from "react";
import { mediaUrl, saveMediaBytes, inTauri } from "./native";
import { ImageCrop } from "./ImageCrop";
import { notify, motion, useReducedMotion } from "./motion";
import { CoverPicker, presetFor } from "./covers";
import type { Deck } from "./lib";
export function ManagedImage({
  name,
  alt,
}: {
  name?: string | null;
  alt: string;
}) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    mediaUrl(name)
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [name]);
  return src ? <img className="study-image" src={src} alt={alt} /> : null;
}

export function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    target = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState(false);
  const reduced = useReducedMotion();
  const removalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removedPreview, setRemovedPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (removalTimer.current) clearTimeout(removalTimer.current);
    },
    [],
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [large, setLarge] = useState(false);
  const process = async (file: File) => {
    setError("");
    if (
      !/^image\/(png|jpeg|webp)$/.test(file.type) ||
      file.size > 25 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG or WebP image under 25 MB.");
      return;
    }
    setBusy(true);
    try {
      if (inTauri()) onChange(await saveMediaBytes(file));
      else
        onChange(
          await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
        );
      notify("Image added");
      return true;
    } catch {
      setError("Could not attach the image. Please try again.");
      notify("Could not attach the image", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const el = target.current!;
    const receive = (e: Event) => {
      void process((e as CustomEvent<File>).detail);
    };
    el.addEventListener("flint-image", receive);
    return () => el.removeEventListener("flint-image", receive);
  });
  return (
    <div
      ref={target}
      className="attachment"
      tabIndex={0}
      aria-label={label + " attachment"}
      title="Choose, drop, or paste PNG, JPEG or WebP"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files[0]) void process(e.dataTransfer.files[0]);
      }}
      onPaste={(e) => {
        if (e.clipboardData.files[0]) {
          e.preventDefault();
          void process(e.clipboardData.files[0]);
        }
      }}
    >
      {crop && value && (
        <ImageCrop
          name={value}
          onClose={() => setCrop(false)}
          onApply={async (file) => {
            if (!(await process(file))) throw Error("Image save failed");
          }}
        />
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) void process(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {(value || removedPreview) && (
        <button
          className={"attachment-thumb" + (removing ? " removing" : "")}
          onClick={() => setLarge(true)}
          aria-label={"View larger " + label}
        >
          <ManagedImage name={value || removedPreview} alt={label} />
        </button>
      )}
      <div className="attachment-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy
            ? "Attaching…"
            : value
              ? "Replace"
              : label === "cover image"
                ? "Upload image"
                : "+ Image"}
        </button>
        {value && (
          <>
            <button
              className="secondary"
              disabled={removing}
              onClick={() => {
                setRemovedPreview(value || null);
                onChange(null);
                setRemoving(true);
                removalTimer.current = setTimeout(
                  () => {
                    setRemovedPreview(null);
                    setRemoving(false);
                  },
                  reduced ? 0 : motion.panel,
                );
              }}
            >
              {label === "cover image" ? "Use Flint preset" : "Remove"}
            </button>
            <button className="secondary" onClick={() => setLarge(true)}>
              View larger
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setCrop(true)}
            >
              Crop / reposition
            </button>
          </>
        )}
      </div>
      {error && <small role="alert">{error}</small>}
      {large && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLarge(false);
          }}
        >
          <button
            autoFocus
            className="secondary"
            onClick={() => setLarge(false)}
          >
            Close preview
          </button>
          <ManagedImage name={value} alt={label} />
        </div>
      )}
    </div>
  );
}

export const imageDrag = (dt: DataTransfer | null) =>
  !!dt &&
  Array.from(dt.items || []).some(
    (i) => i.kind === "file" && /^image\/(png|jpeg|webp)$/.test(i.type),
  );
export function ImageDestination({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className + " image-destination"}
      data-image-target
      onDragOver={(e) => {
        if (imageDrag(e.dataTransfer)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDropCapture={(e) => {
        const file = Array.from(e.dataTransfer.files).find((f) =>
          /^image\/(png|jpeg|webp)$/.test(f.type),
        );
        if (!file) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget
          .querySelector(".attachment")
          ?.dispatchEvent(new CustomEvent("flint-image", { detail: file }));
      }}
    >
      {children}
    </div>
  );
}
export function CoverEditor({
  deck,
  onChange,
}: {
  deck: Pick<Deck, "id" | "title" | "coverImage">;
  onChange: (id: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    [error, setError] = useState("");
  return (
    <div ref={root} className="cover-editor">
      <ImageDestination>
        <CoverPicker
          deck={deck}
          onChange={onChange}
          onUpload={() =>
            root.current
              ?.querySelector<HTMLInputElement>('input[type="file"]')
              ?.click()
          }
          onPaste={async () => {
            setError("");
            try {
              const items = await navigator.clipboard.read();
              for (const item of items) {
                const type = item.types.find((t) =>
                  /^image\/(png|jpeg|webp)$/.test(t),
                );
                if (type) {
                  const blob = await item.getType(type);
                  root.current?.querySelector(".attachment")?.dispatchEvent(
                    new CustomEvent("flint-image", {
                      detail: new File([blob], "clipboard.png", { type }),
                    }),
                  );
                  return;
                }
              }
              setError(
                "No image in the clipboard. Copy an image and try again.",
              );
            } catch {
              setError(
                "Clipboard image access is unavailable. Use Upload image, or paste directly into the image target.",
              );
            }
          }}
        />
        <ImageField
          label="cover image"
          value={
            deck.coverImage?.startsWith("flint:preset/")
              ? null
              : deck.coverImage
          }
          onChange={(value) => onChange(value || presetFor(deck).id)}
        />
        {error && <p role="alert">{error}</p>}
      </ImageDestination>
    </div>
  );
}
export function useImageDragFeedback() {
  useEffect(() => {
    let depth = 0;
    const end = () => {
      depth = 0;
      document.body.classList.remove("editor-image-drag");
    };
    const enter = (e: DragEvent) => {
      if (imageDrag(e.dataTransfer)) {
        depth++;
        document.body.classList.add("editor-image-drag");
      }
    };
    const over = (e: DragEvent) => {
      if (imageDrag(e.dataTransfer)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (imageDrag(e.dataTransfer)) e.preventDefault();
      end();
    };
    const leave = () => {
      if (--depth <= 0) end();
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop, true);
    window.addEventListener("dragend", end);
    window.addEventListener("blur", end);
    return () => {
      end();
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop, true);
      window.removeEventListener("dragend", end);
      window.removeEventListener("blur", end);
    };
  }, []);
}
