import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";
import { mediaUrl } from "./native";
export function cropBounds(
  width: number,
  height: number,
  zoom: number,
  x: number,
  y: number,
  aspect: number,
) {
  const w = Math.min(width, height * aspect) / zoom,
    h = w / aspect;
  return {
    sx: ((width - w) * x) / 100,
    sy: ((height - h) * y) / 100,
    sw: w,
    sh: h,
  };
}
export function ImageCrop({
  name,
  onApply,
  onClose,
}: {
  name: string;
  onApply: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [aspect, setAspect] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void mediaUrl(name)
      .then((url) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (active) {
            image.current = img;
            setAspect(img.naturalWidth / img.naturalHeight);
            setReady(true);
          }
        };
        img.onerror = () => {
          if (active) setError("Couldn't open this image for cropping.");
        };
        img.src = url;
      })
      .catch(() => setError("Couldn't read this image."));
    return () => {
      active = false;
    };
  }, [name]);
  useEffect(() => {
    const img = image.current,
      c = canvas.current;
    if (!ready || !img || !c) return;
    const b = cropBounds(
      img.naturalWidth,
      img.naturalHeight,
      zoom,
      x,
      y,
      aspect,
    );
    const scale = Math.min(1, 1400 / b.sw, 1400 / b.sh);
    c.width = Math.max(1, Math.round(b.sw * scale));
    c.height = Math.max(1, Math.round(b.sh * scale));
    c.getContext("2d")?.drawImage(
      img,
      b.sx,
      b.sy,
      b.sw,
      b.sh,
      0,
      0,
      c.width,
      c.height,
    );
  }, [ready, zoom, x, y, aspect]);
  return (
    <Modal
      title="Crop and reposition image"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        The original attachment is retained for Undo. Saving creates a new
        image.
      </p>
      {error && <p role="alert">{error}</p>}
      <canvas ref={canvas} className="crop-preview" />
      <label>
        Shape
        <select value={aspect} onChange={(e) => setAspect(+e.target.value)}>
          <option value={1}>Square</option>
          <option value={16 / 9}>Wide</option>
          <option value={4 / 3}>Landscape</option>
          {image.current && (
            <option
              value={image.current.naturalWidth / image.current.naturalHeight}
            >
              Original proportions
            </option>
          )}
        </select>
      </label>
      {[
        ["Zoom", zoom, setZoom, 1, 4],
        ["Horizontal position", x, setX, 0, 100],
        ["Vertical position", y, setY, 0, 100],
      ].map(([label, value, set, min, max]) => (
        <label key={String(label)}>
          {String(label)}
          <input
            aria-label={String(label)}
            type="range"
            min={Number(min)}
            max={Number(max)}
            step={0.01}
            value={Number(value)}
            onChange={(e) => (set as (n: number) => void)(+e.target.value)}
          />
        </label>
      ))}
      <button
        className="primary"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const blob = await new Promise<Blob | null>((resolve, reject) => {
              if (!canvas.current) {
                reject(Error("Missing canvas"));
                return;
              }
              canvas.current.toBlob(resolve, "image/png");
            });
            if (!blob) throw Error("Empty crop");
            await onApply(
              new File([blob], "cropped.png", { type: "image/png" }),
            );
            onClose();
          } catch {
            setError("Could not save the cropped image.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Apply crop
      </button>
      <button className="secondary" disabled={busy} onClick={onClose}>
        Cancel
      </button>
    </Modal>
  );
}
